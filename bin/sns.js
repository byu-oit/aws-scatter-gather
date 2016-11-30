/**
 *  @license
 *    Copyright 2016 Brigham Young University
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 **/
'use strict';
const AWS                   = require('aws-sdk');
const debug                 = require('./debug')('sns', 'white');
const defer                 = require('./defer');
const EventInterface        = require('./event-interface');
const schemas               = require('./schemas');

const rxTopicArn = /^arn:aws:sns:[\s\S]+?:\d+:[\s\S]+?$/;

module.exports = ScatherSns;

function ScatherSns(configuration) {
    const config = schemas.middleware.normalize(configuration || {});
    const factory = Object.create(ScatherSns.prototype);
    const subscriptions = {};
    const publishedRequests = {};
    if (!config.sns) config.sns = new AWS.SNS();

    /**
     * A connect middleware function.
     * @param req
     * @param res
     * @param next
     * @returns {*}
     */
    factory.middleware = function(req, res, next) {

        // if this is not a message from aws then continue to next middleware
        if (req.method !== 'POST' || !req.headers['x-amz-sns-message-type']) return next();

        parseBody(req)
            .then(function(body) {
                switch (req.headers['x-amz-sns-message-type']) {
                    case 'Notification':
                        var event;
                        try { event = JSON.parse(body.Message); } catch (e) {}
                        if (event && event.requestId) {
                            debug('Received notification event ' + event.type + ':' + event.requestId + ' with data: ' + event.data, event);
                            EventInterface.emit(event.type, event.topicArn, event);
                        } else {
                            debug('Received unexpected event data.', event ? event : body.message);
                        }
                        break;
                    case 'SubscriptionConfirmation':
                        if (subscriptions.hasOwnProperty(body.TopicArn)) {
                            const params = {
                                Token: body.Token,
                                TopicArn: body.TopicArn
                            };
                            config.sns.confirmSubscription(params, function (err) {
                                debug('Subscription confirmation for ' + body.TopicArn +
                                    (err ? ' failed: ' + err.message: ' succeeded.'), params);
                                if (err) return subscriptions[body.TopicArn].reject(err);
                                subscriptions[body.TopicArn].resolve();
                            });
                        }
                        break;
                }

                if (!config.passThrough) res.end();
            })
            .catch(next);
    };

    /**
     * Subscribe to an SNS Topic.
     * @param {string} topicArn
     * @returns {Promise}
     */
    factory.subscribe = function(topicArn) {

        // validate the topic arn
        if (!rxTopicArn.test(topicArn)) throw Error('Cannot subscribe to an invalid AWS Topic Arn: ' + topicArn);

        // if already subscribed then return now
        if (subscriptions[topicArn]) return subscriptions[topicArn].promise;

        // create and store the deferred promise
        const deferred = defer();
        subscriptions[topicArn] = deferred;

        // make the sns subscribe request
        const params = {
            Protocol: /^(https?):/.exec(config.endpoint)[1],
            TopicArn: topicArn,
            Endpoint: config.endpoint
        };
        config.sns.subscribe(params, function(err) {
            debug('Subscription request for ' + topicArn + (err ? ' failed : ' + err.message : ' sent.'));
            if (err) return deferred.reject(err);
        });

        return deferred.promise;
    };

    /**
     * Unsubscribe from an SNS Topic
     * @param {string} topicArn
     * @returns {Promise}
     */
    factory.unsubscribe = function(topicArn) {

        // if not subscribed then return now
        if (!subscriptions[topicArn]) {
            debug('Not subscribed to ' + topicArn);
            return Promise.resolve();
        }

        return new Promise(function(resolve, reject) {
            const params = { SubscriptionArn: topicArn };
            config.sns.unsubscribe(params, function (err) {
                debug('Unsubscribe from ' + topicArn + (err ? ' failed: ' + err.message : 'succeeded'));
                if (err) return reject(err);
                delete subscriptions[topicArn];
                resolve();
            });
        });
    };



    // overwrite the server listen function to know when to start making subscriptions
    if (config.subscribe && config.topics.length > 0) {
        const serverListen = config.server.listen;
        config.server.listen = function () {
            const args = Array.prototype.slice.call(arguments, 0);
            const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
            args.push(function () {
                config.topics.forEach(factory.subscribe);
                if (callback) callback.apply(config.server, arguments);
            });
            serverListen.apply(config.server, args);
        };
    }

    // add event listener that picks up request events and posts to sns topic
    EventInterface.on('request', function(event) {

        // if will be an endless loop due to the same topic and response arn then don't let it go on
        if (event.topicArn === event.responseArn) {
            if (publishedRequests[event.requestId] && similarObject(event, publishedRequests[event.requestId])) {
                delete publishedRequests[event.requestId];
                return;
            } else {
                publishedRequests[event.requestId] = event;
                setTimeout(function() { delete publishedRequests[event.requestId]; }, 120000);
            }
        }

        (subscriptions[event.responseArn] ? subscriptions[event.responseArn].promise : Promise.resolve())
            .then(function() {
                const params = {
                    Message: JSON.stringify(event),
                    TopicArn: event.topicArn
                };
                config.sns.publish(params, function(err) {
                    if (err) {
                        debug('Failed to publish event ' + event.requestId + ' to ' + event.topicArn + ': ' + err.message, event);
                    } else {
                        debug('Published event ' + event.requestId + ' to ' + event.topicArn, event);
                    }
                });
            });
    });

    return factory;
}

function similarObject(a, b) {
    const keys = Object.keys(a);
    var i;
    var key;
    for (i = 0; i < keys.length; i++) {
        key = keys[i];
        if (a[key] !== b[key]) return false;
    }
    return true;
}

/**
 * Parse the response body.
 * @param {Object} req
 * @returns {Promise}
 */
function parseBody(req) {
    return new Promise(function(resolve, reject) {
        var body = '';

        req.on('error', reject);

        req.on('data', function(chunk) {
            body += chunk.toString();
        });

        req.on('end', function() {
            try {
                req.body = JSON.parse(body);
                resolve(req.body);
            } catch (err) {
                reject(Error('Unexpected body format received. Expected application/json, received: ' + body));
            }
        });
    });
}