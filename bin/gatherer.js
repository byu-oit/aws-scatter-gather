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
const Promise       = require('bluebird');

/**
 * Define a gatherer function that applies the configuration constraints.
 * @param {object} configuration
 * @returns {gatherer}
 */
module.exports = function (configuration) {

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
};