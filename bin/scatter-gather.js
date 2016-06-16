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
const defer         = require('./defer');
const machineId     = require('./machine-id');
const Promise       = require('bluebird');
const Server        = require('./server');
const uuid          = require('uuid').v4;

/**
 * Get the scatter gather factory function.
 * @param {object} sns An AWS sns instance to publish events to and to subscribe to.
 * @param {object} configuration The configuration to apply to this scatter-gather instance.
 * @returns {Promise<{request: function, response: function}>}
 */
module.exports = function (sns, configuration) {
    const gatherers = {};

    // build the normalized configuration
    const defaults = {
        name: '',
        port: 11200,
        endpoint: '',
        topicArn: '',
        version: '1.0'
    };
    const config = Object.assign(defaults, configuration);

    // start the server
    return Server(sns, config, notificationHandler)
        .then(function(app) {
            const close = function() {
                return new Promise(function(resolve, reject) {
                    app.server.close(function(err) {
                        if (err) return reject(err);
                        resolve();
                    })
                });
            };
            return {
                end: close,
                request: scatterGather,
                response: responseHandler
            }
        });






    function defineGatherer(configuration) {

        // get normalized configuration
        const defaults = {
            maxWait: 3000,
            minWait: 0,
            responses: []
        };
        const config = Object.assign(defaults, configuration || {});

        // define the deferred object
        const deferred = defer();

        // define the results object
        const result = [];
        result.additional = { list: [], map: {} };
        result.complete = false;
        result.expected = { list: [], map: {} };
        result.missing = config.responses.slice(0);
        result.map = {};

        // define maximum and minimum delay promises
        const minTimeoutPromise = Promise.delay(config.minWait);
        const maxTimeoutPromise = Promise.delay(config.maxWait);

        // if minimum delay is reached and nothing is missing then resolve
        minTimeoutPromise.then(() => {
            if (result.missing.length === 0 && deferred.promise.isPending()) deferred.resolve(result);
        });

        // if maximum delay is reached then resolve
        maxTimeoutPromise.then(() => {
            if (deferred.promise.isPending()) deferred.resolve(result);
        });

        // define the gatherer
        function gatherer(event) {

            // if already resolved then exit now
            if (!deferred.promise.isPending()) return;

            // delete reference from the wait map
            const index = result.missing.indexOf(event.sender.name);
            if (index !== -1) result.missing.splice(index, 1);

            // create the item
            const item = {
                data: event.data,
                error: event.error,
                expected: index !== -1,
                name: event.sender.name
            };

            // add the item to the result array and map
            result.push(item);
            result.map[item.name] = item;

            // add the item to it's appropriate filter set
            if (!item.expected) {
                result.additional.list.push(item);
                result.additional.map[item.name] = item;
            } else {
                result.expected.list.push(item);
                result.expected.map[item.name] = item;
            }

            // all expected responses received and min timeout passed, so resolve the deferred promise
            if (result.missing.length === 0 && minTimeoutPromise.isFulfilled() && deferred.promise.isPending()) {
                deferred.resolve(result);
            }
        }

        // expose the promise to outside code
        gatherer.promise = deferred.promise;

        // return the gatherer
        return gatherer;
    }

    /**
     * Get a unique id.
     * @returns {string}
     */
    function getUniqueId() {
        return (config.name ? config.name + '-' : '') + machineId + '-' + uuid();
    }

    /**
     * Accept a notification body and process it.
     * @param {object} body
     */
    function notificationHandler(body) {
        const message = JSON.parse(body.Message);
        const event = JSON.parse(message.Records[0].Sns.Message);
        if (gatherers.hasOwnProperty(event.sender.targetId)) gatherers[event.sender.targetId](event);
    }

    /**
     * Create a response handler for an AWS lambda function that will respond to
     * a scattered request.
     * @param {function} handler A function to call to accept an event and produce an event.
     * @returns {Function}
     */
    function responseHandler(handler) {
        return function(event, context, callback) {

            // validate event structure
            if (!event.hasOwnProperty('Records')) return callback(Error('Event missing required property: Records'));
            if (!Array.isArray(event.Records)) return callback(Error('Event.Records expected Array. Received: ' + event.Records));
            if (event.Records.length === 0) return callback(null, null);

            event.Records.forEach(function(record) {
                if (record.hasOwnProperty('Sns')) {
                    const message = parseIfJson(record.Sns.Message);
                    if (message && typeof message === 'object' && message.sender && typeof message.sender === 'object') {
                        const sender = message.sender;
                        if (!sender.targetId && sender.responseId) {     // replies wait for responses
                            handler(message.data, sender, function(err, response) {
                                const result = {
                                    error: err,
                                    data: response,
                                    sender: {                               // required
                                        name: context.functionName || '',   // the name of the sender (only required when a target is specified)
                                        responseId: null,                   // no response needed
                                        targetId: sender.responseId,        // someone is expecting the event with this ID
                                        version: '1.0'                      // the sender version
                                    }
                                };
                                const params = {
                                    Message: JSON.stringify(result),
                                    TopicArn: record.Sns.TopicArn
                                };
                                sns.publish(params, function(err, data) {
                                    if (err) return callback(err);
                                    return callback(null, result);
                                });
                            });
                        }
                    }
                }
            });
        }
    }

    /**
     * Send a scattered request along the configured AWS SNS topic.
     * @param {*} event The event data to send with the request.
     * @param {object} configuration The gather configuration.
     * @returns {Promise<object>}
     */
    function scatterGather(event, configuration) {
        return new Promise(function(resolve, reject) {

            // get unique id
            const id = getUniqueId();

            // build and store the gatherer
            const gatherer = defineGatherer(configuration);
            gatherers[id] = gatherer;

            // create publish event parameters
            const publishParams = {
                Message: JSON.stringify({
                    error: null,
                    data: event,
                    sender: {
                        name: config.name,
                        responseId: id,
                        targetId: null,
                        version: config.version
                    }
                }),
                TopicArn: config.topicArn
            };

            // publish the event
            sns.publish(publishParams, function(err) {
                if (err) reject(err);
            });

            // use the response from the gatherer's promise to resolve or reject this promise
            gatherer.promise
                .then(function(result) {
                    delete gatherers[id];
                    result.complete = result.missing.length === 0;
                    resolve(result);
                }, reject);
        });
    }
};

/**
 * Attempt to parse a JSON string and return it, or null.
 * @param {string} data
 * @returns {object}
 */
function parseIfJson(data) {
    try {
        return JSON.parse(data);
    } catch (e) {
        return null;
    }
}