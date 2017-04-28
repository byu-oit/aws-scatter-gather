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
const debug                 = require('./debug')('lambda', 'magenta');
const schemas               = require('./schemas');
const CB                    = require('./circuitbreaker');

module.exports = lambda;

function lambda(handler) {

    // determine the configuration
    const config = handler && typeof handler === 'object' ? handler : {};
    if (typeof handler === 'function') {
        config.handler = handler;
        config.name = handler.name;
        config.sns = new AWS.SNS();
    }

    // validate the configuration
    if (!config.name || typeof config.handler !== 'function') throw Error('The handler function must be a named function.');
    debug('Defined lambda handler: ' + config.name);

    return function(event, context, callback) {
        const promises = [];

        // process each record through the handler
        if (event.hasOwnProperty('Records')) {
            event.Records.forEach(function (record) {
                if (record.Sns) {
                    const e = decode(record.Sns.Message);
                    if (e && e.requestId && e.type === 'request') {
                        debug('Received sns event ' + e.requestId + ' with data: ' + e.data, e);

                        const circuitbreakerState = e.circuitbreakerState || CB.CLOSED;

                        // call the handler using the paradigm it expects
                        var promise = config.handler.length >= 3
                            ? new Promise(function(resolve, reject) {
                                config.handler(e.data, circuitbreakerState, function(err, data) {
                                    if (err) return reject(err);
                                    resolve(data);
                                });
                            })
                            : Promise.resolve(config.handler(e.data, circuitbreakerState));

                        // if the incoming event has a response arn then send a response via sns to that arn
                        if (e.responseArn) {
                            promise = promise
                                .then(function(data) {
                                    const event = schemas.event.normalize({
                                        data: data,
                                        requestId: e.requestId,
                                        name: config.name,
                                        topicArn: e.responseArn,
                                        type: 'response',
                                        circuitbreakerSuccess: (e.circuitbreakerState) ? true : false
                                    });

                                    const params = {
                                        Message: JSON.stringify(event),
                                        TopicArn: event.topicArn
                                    };
                                    config.sns.publish(params, function (err) {
                                        if (err) {
                                            debug('Failed to publish response event ' + event.requestId + ' to ' + event.topicArn + ': ' + err.message, event);
                                        } else {
                                            debug('Published response event ' + event.requestId + ' to ' + event.topicArn, event);
                                        }
                                    });
                                    
                                    return event;
                                })
                                .catch(function(err) {
                                    debug(err.stack, err); 
                                    const event = schemas.event.normalize({
                                        error: JSON.stringify(err),
                                        data: '',
                                        requestId: e.requestId,
                                        name: config.name,
                                        topicArn: e.responseArn,
                                        type: 'response',
                                        circuitbreakerFault: (e.circuitbreakerState) ? true : false
                                    });

                                    const params = {
                                        Message: JSON.stringify(event),
                                        TopicArn: event.topicArn
                                    };
                                    config.sns.publish(params, function (err) {
                                        if (err) {
                                            debug('Failed to publish response event ' + event.requestId + ' to ' + event.topicArn + ': ' + err.message, event);
                                        } else {
                                            debug('Published response event ' + event.requestId + ' to ' + event.topicArn, event);
                                        }
                                    });
                                    
                                    return event;
                                });
                        } else {
                            // log errors
                            promise.catch(function(err) { debug(err.stack, err); });
                        }

                        promises.push(promise);
                    }
                }
            });
        }

        // get a promise that everything completes
        const completed = Promise.all(promises);

        // return result with promise or callback paradigm
        if (typeof callback !== 'function') return completed;
        completed.then(
            function(data) { callback(null, data); },
            function(err) { callback(err, null); }
        );
    }
}

function decode(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}
