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
const getGatherer   = require('./gatherer');
const Logger        = require('./logger');
const machineId     = require('./machine-id');
const Promise       = require('bluebird');
const Server        = require('./server');
const uuid          = require('uuid').v4;

module.exports = Scather;

/**
 * Get the scatter gather factory function.
 * @param {object} sns An AWS sns instance to publish events to and to subscribe to.
 * @param {object} configuration The configuration to apply to this scatter-gather instance.
 * @returns {Scather}
 */
function Scather (sns, configuration) {
    const factory = Object.create(Scather.prototype);
    const gatherers = {};
    var serverPromise;

    // build the normalized configuration
    const defaults = {
        log: false,
        name: '',
        port: 11200,
        endpoint: '',
        topicArn: '',
        version: '1.0'
    };
    const config = Object.assign(defaults, configuration);

    // create the logger and add it to the config object
    const logger = Logger(config.log);
    config.logger = logger;

    /**
     * If the server is running then end it.
     * @returns {Promise<undefined>}
     */
    factory.end = function() {
        if (!serverPromise) return Promise.resolve();
        return serverPromise.then(end => end());
    };

    /**
     * Send a scattered request along the configured AWS SNS topic.
     * @param {*} event The event data to send with the request.
     * @param {object} configuration The gather configuration.
     * @returns {Promise<object>}
     */
    factory.request = function (event, configuration) {
        const id = uuid();
        logger.log('Request initiated: ' + id);

        return startServer()
            .then(function() {
                return new Promise(function(resolve, reject) {

                    // get unique id
                    const id = (config.name ? config.name + '-' : '') + machineId + '-' + uuid();

                    // build and store the gatherer
                    const gatherer = getGatherer(configuration);
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
                        if (err) {
                            logger.log('Request ' + id + ' failed to publish event.');
                            reject(err);
                        } else {
                            logger.log('Request ' + id + ' published event.');
                        }
                    });

                    // use the response from the gatherer's promise to resolve or reject this promise
                    gatherer.promise
                        .then(function(result) {
                            delete gatherers[id];
                            result.complete = result.missing.length === 0;
                            resolve(result);
                            logger.log('Request ' + id + ' successfully completed.');
                        }, function(err) {
                            reject(err);
                            logger.log('Request ' + id + ' failed to complete');
                        });
                });
            });
    };

    /**
     * Create a response handler for an AWS lambda function that will respond to
     * a scattered request.
     * @param {object} [configuration] An optional configuration for the response.
     * @param {function} handler A function to call to accept an event and produce an event.
     * @returns {Function}
     */
    factory.response = function(configuration, handler) {

        if (typeof configuration === 'function') {
            handler = arguments[0];
            configuration = {};
        }

        return function(event, context, callback) {
            const id = uuid();
            
            logger.log('Response initiated: ' + id);
            logger.log('Response ' + id + ' original event:\n', JSON.stringify(event, null, 2));

            // validate the event and get it's message object
            const validResult = validateRequesterEvent(event);
            if (typeof validResult === 'string') return callback(Error(validResult));

            // set some constants
            const record = validResult.record;
            const message = validResult.message;
            const sender = message.sender;

            logger.log('Response ' + id + ' handling record');

            handler(message.data, sender, function(err, response) {
                logger.log('Response ' + id + ' handled record');
                const result = {
                    error: err,
                    data: response,
                    sender: {
                        name: configuration.name || (context && context.functionName) || '',
                        responseId: null,
                        targetId: sender.responseId,
                        version: configuration.version || config.version
                    }
                };
                const params = {
                    Message: JSON.stringify(result),
                    TopicArn: record.Sns.TopicArn
                };
                if (!message.mock) {
                    sns.publish(params, function(err) {
                        if (err) return callback(err);
                        if (result.error) return callback(result.error);
                        return callback(null, result.data);
                    });
                } else {
                    if (result.error) return callback(result.error);
                    return callback(null, result.data);
                }
            });
        }
    };

    return factory;


    /**
     * Accept a notification body and process it.
     * @param {object} body
     */
    function notificationHandler(body) {
        const event = JSON.parse(body.Message);
        if (gatherers.hasOwnProperty(event.sender.targetId)) gatherers[event.sender.targetId](event);
    }

    /**
     * Start a server that will subscribe to the AWS SNS Topic.
     * @returns {Promise<function>} resolves to a the close function.
     */
    function startServer() {
        if (!serverPromise) {
            serverPromise = Server(sns, config, notificationHandler)
                .then(function (app) {
                    return function () {
                        return new Promise(function (resolve, reject) {
                            app.server.close(function (err) {
                                if (err) return reject(err);
                                serverPromise = null;
                                resolve();
                            })
                        });
                    };
                });
        }
        return serverPromise;
    }
}

/**
 * Determine if an event is a valid request event.
 * @param {object} event
 * @returns {boolean}
 */
Scather.isRequestEvent = function(event) {
    const result = validateRequesterEvent(event);
    return typeof result === 'object';
};

Scather.mock = {};

/**
 * Generate an event that looks enough like an SNS Topic event that the scatherer will process it.
 * @param {*} data The data to add to the event.
 * @returns {object}
 */
Scather.mock.requestEvent = function(data) {
    const event = {
        Records: []
    };
    var i;
    var message;
    for (i = 0; i < arguments.length; i++) {
        message = {
            error: null,
            data: arguments[i],
            mock: true,
            sender: {
                name: '-',
                responseId: '-',
                targetId: '',
                version: '0.0'
            }
        };
        event.Records.push({
            Sns: {
                Message: JSON.stringify(message)
            }
        });
    }
    return event;
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

/**
 * Check to see if an event object is an aws-scatter-gather request event.
 * @param event
 * @returns {string, object}
 */
function validateRequesterEvent(event) {

    // validate the event
    if (!event || typeof event !== 'object') return 'Event must be an object';
    if (!event.hasOwnProperty('Records')) return 'Event missing required property: Records';
    if (!Array.isArray(event.Records) || event.Records.length !== 1) return 'Event.Records expected Array of length 1. Received: ' + event.Records;

    const record = event.Records[0];
    if (!record.hasOwnProperty('Sns') || !record.Sns || typeof record.Sns !== 'object') return 'Invalid value for event.Records[0].Sns';

    const message = parseIfJson(record.Sns.Message);
    if (!message || typeof message !== 'object' ||
        !message.hasOwnProperty('sender') ||
        !message.sender ||
        typeof message.sender !== 'object') return 'Invalid aws-scatter-gather event message';

    const sender = message.sender;
    if (sender.targetId || !sender.responseId) return 'Not an aws-scatter-gather requester event';

    return {
        record: record,
        message: message
    };
}