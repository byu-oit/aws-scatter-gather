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
const debug                 = require('./debug')('lambda', 'cyan');
const response              = require('./response');
const schemas               = require('./schemas');

module.exports = function(configuration, handler) {
    const config = schemas.response.normalize(Object.assign({}, configuration, { eventBased: false }));
    const res = response(config);
    const sns = configuration.sns || new AWS.SNS();

    return function(event, context, callback) {
        const promises = [];
        debug('Called with' + (handler ? '' : 'out') + ' secondary handler.', event);

        // if the event has scather data then emit internal events to handle the request
        if (event.hasOwnProperty('Records')) {
            event.Records.forEach(function(record) {
                if (record.Sns) {
                    var event;
                    try { event = JSON.parse(record.Sns.Message); } catch (e) {}
                    if (event && event.requestId && event.type === 'request') {
                        debug('Received scather event ' + event.requestId + ' with data: ' + event.data);
                        const promise = res(event);
                        promise.then(function(event) {
                            if (event) {
                                const params = {
                                    Message: JSON.stringify(event),
                                    TopicArn: event.topicArn
                                };
                                sns.publish(params, function (err) {
                                    if (err) {
                                        debug('Failed to publish event ' + event.requestId + ' to ' + event.topicArn + ': ' + err.message, event);
                                    } else {
                                        debug('Published event ' + event.requestId + ' to ' + event.topicArn, event);
                                    }
                                });
                            }
                        });
                        promises.push(promise);
                    }
                }
            });
        }

        if (handler) {
            Promise.all(promises)
                .then(
                    function() {
                        debug('Calling secondary handler after scather success.');
                        handler(event, context, callback);
                    }, function(err) {
                        debug('Calling secondary handler after scather error: ' + err.stack);
                        handler(event, context, callback);
                    }
                );
        } else {
            Promise.all(promises)
                .then(function(data) {
                    debug('Success');
                    callback(null, data);
                })
                .catch(function(err) {
                    debug('Error: ' + err.stack);
                    callback(err, null);
                });
        }
    };
};