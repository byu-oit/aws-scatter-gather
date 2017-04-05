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

const schemas               = require('./schemas');
const cb                    = require('./circuitbreaker');

module.exports = function(configuration) {
    const config = schemas.response.normalize(configuration || {});
    const responder = config.responder;
    if (typeof responder !== 'function' || !responder.name) {
        throw Error('Scather.response expected a named function as its first parameter. Received: ' + responder);
    }
    const bypass = config.bypass || responder;

    const fn = function (data, callback) {

        const handler = (data.parameters.CBState===cb.OPEN) ? bypass : responder;

        // call the handler using its expected paradigm
        const promise = handler.length > 1
            ? new Promise(function(resolve, reject) {
                handler(data, function(err, result) {
                    if (err) return reject(err);
                    resolve(result);
                });
            })
            : Promise.resolve(handler(data));

        // provide an asynchronous response in the expected paradigm
        if (typeof callback !== 'function') return promise;
        promise.then(
            function (data) { callback(null, data); },
            function (err) { callback(err, null); }
        );
    };

    Object.defineProperty(fn, 'name', {
        value: responder.name,
        writable: false
    });

    return fn;
};
