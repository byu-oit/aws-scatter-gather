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
const CB                    = require('./circuitbreaker');
const EventInterface        = require('./event-interface');
const schemas               = require('./schemas');
const debug                 = require('./debug')('response', 'blue');

function configure(parm) {
    if(typeof parm === 'function') {
        return schemas.response.normalize({
            handler: parm,
            name: parm.name,
            sns: new AWS.SNS(),
        });
    }
    return schemas.response.normalize(parm);
}

module.exports = function(handler) {
    // determine the configuration
    const config = configure(handler);
    if (!Array.isArray(config.topics)) config.topics = null;    // null means any topic

    // validate input
    if (typeof config.handler !== 'function' || !config.name) {
        throw Error('Scather.response expected a named function as its first parameter. Received: ' + handler);
    }

    config.bypass = config.bypass || config.handler;

    // define the response function wrapper
    const fn = function (data, circuitbreakerState, callback) {

        const responder = (circuitbreakerState===CB.OPEN) ? config.bypass : config.handler;

        // call the handler using its expected paradigm
        const promise = responder.length > 1
            ? new Promise(function(resolve, reject) {
                responder(data, function(err, result) {
                    if (err) return reject(err);
                    resolve(result);
                });
            })
            : Promise.resolve(responder(data));

        // provide an asynchronous response in the expected paradigm
        if (typeof callback !== 'function') return promise;
        promise.then(
            function (data) { callback(null, data); },
            function (err) { callback(err, null); }
        );
    };

    Object.defineProperty(fn, 'name', {
        value: config.name,
        writable: false
    });


    // listen for request events and provide responses
    EventInterface.on('request', function(e) {
        if (e.hasOwnProperty('data') && e.hasOwnProperty('responseArn') &&
            (!config.topics || config.topics.indexOf(e.topicArn) !== -1)) {

            const circuitbreakerState = e.circuitbreakerState || CB.CLOSED;

            fn(e.data, circuitbreakerState)
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
                        data: '',
                        error: JSON.stringify(err),
                        requestId: e.requestId,
                        name: config.name,
                        topicArn: e.responseArn,
                        type: 'response',
                        circuitbreakerFault:(e.circuitbreakerState) ? true : false
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
        }
    });

    return fn;
};
