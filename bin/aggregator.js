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
const copy                  = require('./copy');
const debug                 = require('./debug')('aggregator', 'green');
const defer                 = require('./defer');
const EventInterface        = require('./event-interface');
const schemas               = require('./schemas');
const uuid                  = require('./uuid');
const CB                    = require('./circuitbreaker');

const configure = function(configuration) {
    const config = copy(schemas.request.normalize(configuration || {}), true);
    if (!config.sns) {
      return copy(Object.assign({}, config, {sns: new AWS.SNS()}), true);
    }
    return config;
};

/**
 * Create an aggregator function.
 * @param {object} [configuration={}]
 * @returns {Function}
 */
module.exports = function (configuration) {
    var config = configure(configuration);
    const composer = config.composer;

    // create the aggregator function that will be returned
    const aggregator = function(data, callback) {
        const responseArn = config.responseArn || config.topicArn;
        const deferred = defer();
        const event = schemas.event.normalize({
            data: data,
            name: config.name,
            requestId: uuid(),
            responseArn: responseArn,
            topicArn: config.topicArn,
            type: 'request',
            circuitbreakerState: (config.circuitbreaker) ? config.circuitbreaker.state() : CB.CLOSED
        });
        const missing = config.expects.slice(0);
        const result = {};
        var minTimeoutReached = false;
        var pending = true;

        // define the gatherer function
        function gatherer(received) {

            // delete reference from the wait map
            const index = missing.indexOf(received.name);
            if (index !== -1) missing.splice(index, 1);

            // determine if the response was requested
            const requested = received.requestId === event.requestId;

            // if already resolved or rejected then exit now, also verify that the event is being listened for
            if (pending && requested) {

                // store response
                if (!received.error) {
                    result[received.name] = received.data;
                    debug('Received response to request ' + received.requestId + ' from ' + received.name);
                    if (config.circuitbreaker && received.circuitbreakerSuccess) {
                        config.circuitbreaker.success();
                    }
                } else if (config.circuitbreaker && received.circuitbreakerFault) {
                    debug('Received response to request ' + received.requestId + ' from ' + received.name + ' which triggered a circuitbreaker fault with the error: ' + received.error);
                    config.circuitbreaker.fault();
                } else {
                    debug('Received response to request ' + received.requestId + ' from ' + received.name + ' as an error: ' + received.error);
                }

                // all expected responses received and min timeout passed, so resolve the deferred promise
                if (missing.length === 0) {
                    clearTimeout(maxTimeoutId);
                    debug('Received all expected responses for request ' + received.requestId);
                    if (minTimeoutReached) {
                        pending = false;
                        deferred.resolve(result);
                    }
                }

                if (config.each) {
                    const meta = {
                        active: pending,
                        minWaitReached: minTimeoutReached,
                        missing: missing.slice(0)
                    };
                    const done = function (err) {
                        pending = false;
                        if (err) return deferred.reject(err);
                        deferred.resolve(result);
                    };
                    config.each(received, meta, done);
                }
            }

        }

        function unsubscribe() {
            EventInterface.off('response', event.responseArn, gatherer);
            debug('Unsubscribed ' + config.name + ' from response:' + event.responseArn, event);
        }



        // if maximum delay is reached then resolve
        const maxTimeoutId = setTimeout(function () {
            if (pending) {
                pending = false;
                debug('Reached maximum wait time.', event);
                deferred.resolve(result);
            }
        }, config.maxWait);

        // if minimum delay is reached and nothing is missing then resolve
        setTimeout(function () {
            minTimeoutReached = true;
            if (missing.length === 0 && pending) {
                pending = false;
                clearTimeout(maxTimeoutId);
                debug('Reached minimum wait time', event);
                deferred.resolve(result);
            }
        }, config.minWait);

        // subscribe to responses until the gatherer completes
        EventInterface.on('response', event.responseArn, gatherer);
        debug('Subscribed ' + config.name + ' to response:' + event.responseArn, event);
        deferred.promise.then(unsubscribe, unsubscribe);

        // fire the event
        const params = {
            Message: JSON.stringify(event),
            TopicArn: event.topicArn
        };
        config.sns.publish(params, function (err) {
            if (err) {
                debug('Failed to publish request event ' + event.requestId + ' to ' + event.topicArn + ': ' + err.message, event);
            } else {
                debug('Published request event ' + event.requestId + ' to ' + event.topicArn, event);
            }
        });
        //EventInterface.emit('request', event.topicArn, event);
        //debug('Emitted ' + event.requestId + ' to request:' + event.topicArn + ' with data: ' + data, event);

        // after aggregation run the composer
        const completed = deferred.promise
            .then(function(res) {
                return composer.length >= 2
                    ? new Promise(function(resolve, reject) {
                        composer(res, function(err, result) {
                            if (err) return reject(err);
                            resolve(result);
                        });
                    })
                    : Promise.resolve(composer(res));
            });

        // return the results
        if (typeof callback !== 'function') return completed;
        completed.then(
            function (data) {
                callback(null, data);
            },
            function (err) {
                callback(err, null);
            }
        );
    };

    aggregator.mock = function(data, handlers, callback) {
        const results = {};
        const promises = [];

        handlers.forEach(function(handler) {
            const duplicate = copy(data);
            var promise = Promise.resolve(handler(duplicate, {}));

            if (!handler.name) throw Error('Response missing required function name.');

            promise = promise.then(
                function (data) { results[handler.name] = data; },
                function (err) { console.error(err.stack) }
            );

            promises.push(promise);
        });

        // run the results through the composer
        const completed = Promise.all(promises)
            .then(function() {
                return composer.length >= 2
                    ? new Promise(function(resolve, reject) {
                        composer(results, function(err, result) {
                            if (err) return reject(err);
                            resolve(result);
                        });
                    })
                    : Promise.resolve(composer(results));
            });

        // return the results
        if (typeof callback !== 'function') return completed;
        completed.then(
            function (data) {
                callback(null, data);
            },
            function (err) {
                callback(err, null);
            }
        );
    };

    return aggregator;
};
