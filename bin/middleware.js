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
const http                  = require('http');
const debug                 = require('./debug')('middleware', 'cyan');
const defer                 = require('./defer');
const EventInterface        = require('./event-interface');
const schemas               = require('./schemas');

const rxTopicArn = /^arn:aws:sns:[\s\S]+?:\d+:[\s\S]+?$/;

module.exports = middleware;

function middleware(configuration) {
    const config = schemas.middleware.normalize(configuration || {});
    const subscriptions = {};
    if (!config.sns) config.sns = new AWS.SNS();

    // overwrite the server listen function to know when to start making subscriptions
    if (config.subscribe && config.topics.length > 0) {
        const serverListen = config.server.listen;
        config.server.listen = function () {
            const args = Array.prototype.slice.call(arguments, 0);
            const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
            args.push(function () {
                const setupPromise = (config.endpoint) ? Promise.resolve() : getInstanceIp();
                setupPromise.then(function() {
                    const promises = config.subscribe ? config.topics.map(subscribe) : [];
                    if (callback) {
                        Promise.all(promises).then(
                            function() { callback.apply(config.server, arguments) },
                            function() { callback.apply(config.server, arguments) }
                        );
                    }
                });
            });
            serverListen.apply(config.server, args);
        };
    }

    // when the server closes then unsubscribe topics
    config.server.on('close', function() {
        if (config.subscribe) config.topics.forEach(unsubscribe);
    });

    /**
     * A connect middleware function.
     * @param req
     * @param res
     * @param next
     * @returns {*}
     */
    return function(req, res, next) {

        // if this is not a message from aws then continue to next middleware
        if (req.method !== 'POST' || !req.headers['x-amz-sns-message-type']) return next();

        (config.useBodyParser ? parseBody(req) : Promise.resolve(req.body))
            .then(function(body) {
                switch (req.headers['x-amz-sns-message-type']) {
                    case 'Notification':
                        var event;
                        try { event = JSON.parse(body.Message); } catch (e) {}
                        if (event && event.requestId) {
                            debug('Received notification event ' + event.type + ':' + event.topicArn + ' with data: ' + event.data, event);
                            EventInterface.emit(event.type, event.topicArn, event);
                        } else if (event && event.circuitbreakerEvent) {
                            debug('Received circuitbreaker event ' + event.type, event);
                            if (config.circuitbreaker) {
                                if (event.type === 'success') {
                                    config.circuitbreaker.success();
                                } else if (event.type === 'fault') {
                                    config.circuitbreaker.fault();
                                }
                            }
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
     * Lookup ec2 public IP address for this instance.
     * See http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html for details
     */
    function getInstanceIp() {
        return new Promise(function(resolve, reject) {
            debug('Requesting IP address information from EC2');
            http.get('http://169.254.169.254/latest/meta-data/public-ipv4/', function(res) {
                const statusCode = res.statusCode;
                if(statusCode !== 200) {
                    debug('Error requesting IP from EC2! ' + statusCode);
                    res.resume();
                    return reject();
                }
                res.setEncoding('utf-8');
                var body = '';
                res.on('data', function(data) { body += data });
                res.on('end', function() {
                    config.endpoint = 'http://' + body;
                    debug('setting endpoint to: ' + config.endpoint);
                    return resolve(config.endpoint);
                });
            }).on('error', function(err) {
                debug('Error requesting IP from EC2! ' + err.message);
                return reject();
            });
        });
    }

    /**
     * Subscribe to an SNS Topic.
     * @param {string} topicArn
     * @returns {Promise}
     */
    function subscribe(topicArn) {

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
    }

    /**
     * Unsubscribe from an SNS Topic
     * @param {string} topicArn
     * @returns {Promise}
     */
    function unsubscribe(topicArn) {

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
    }
}

function extractBody(req) {
    return new Promise(function(resolve, reject) {
        if (req._body || req.hasOwnProperty('body')) return resolve(req.body);

        var body = '';

        req.on('error', reject);

        req.on('data', function(chunk) {
            body += chunk.toString();
        });

        req.on('end', function() {
            req.body = body;
            resolve(req.body);
        });
    });
}

/**
 * Parse the response body.
 * @param {Object} req
 * @returns {Promise}
 */
function parseBody(req) {
    return extractBody(req)
        .then(() => {
            if (req.body && typeof req.body === 'object') return req.body;
            try {
                return JSON.parse(req.body);
            } catch (err) {
                throw Error('Unexpected body format received. Expected application/json, received: ' + req.body);
            }
        });
}
