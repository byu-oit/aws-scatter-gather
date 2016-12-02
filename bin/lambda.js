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
const Event                 = require('./event-interface');

module.exports = lambda;

function lambda(handler) {
    if (!handler.name) throw Error('The handler function must be a named function.');

    return function(event, context, callback) {
        const promises = [];

        // process each record through the handler
        if (event.hasOwnProperty('Records')) {
            event.Records.forEach(function (record) {
                if (record.Sns) {
                    const e = decode(record.Sns.Message);
                    if (e && e.requestId && e.type === 'request') {

                        // call the handler using the paradigm it expects
                        var promise = handler.length >= 3
                            ? new Promise(function(resolve, reject) {
                                handler(e.data, function(err, data) {
                                    if (err) return reject(err);
                                    resolve(data);
                                });
                            })
                            : Promise.resolve(handler(e.data));

                        // if the incoming event has a response arn then send a response via sns to that arn
                        if (e.responseArn) {
                            promise = promise
                                .then(function(data) {
                                    const event = {
                                        data: data,
                                        requestId: e.requestId,
                                        name: handler.name,
                                        topicArn: e.responseArn,
                                        type: 'response'
                                    };
                                    Event.emit('response', e.responseArn, event);
                                    return event;
                                });
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