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
const debug             = require('./debug')('lambda', 'cyan');
const response          = require('./response');
const schemas           = require('./schemas');

module.exports = function(configuration, handler) {
    const config = schemas.response.normalize(configuration);
    if (config.development) response(config);

    return function(event, context, callback) {
        const promises = [];

        // if the event has scather data then emit internal events to handle the request
        if (event.hasOwnProperty('Records')) {
            event.Records.forEach(function(record) {
                if (record.Sns) {
                    var event;
                    try { event = JSON.parse(record.Sns.Message); } catch (e) {}
                    if (event && event.requestId) {
                        debug('Received notification event ' + event.requestId + ' with data: ' + event.data, event);
                        promises.push(config.handler(event.data, event));
                    }
                }
            });
        }

        if (handler) {
            Promise.all(promises)
                .then(
                    function() {
                        handler(event, context, callback);
                    }, function() {
                        handler(event, context, callback);
                    }
                );
        } else {
            Promise.all(promises)
                .then(function(data) {
                    callback(null, data);
                })
                .catch(function(err) {
                    callback(err, null);
                });
        }
    };
};