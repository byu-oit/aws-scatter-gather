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
const copy                  = require('./copy');
const debug                 = require('./debug')('circuitbreaker', 'yellow');
const schemas               = require('./schemas');

exports.CLOSED = "closed";
exports.OPEN = "open";
exports.INDETERMINATE = "indeterminate";

const cb = Circuitbreaker();

function Circuitbreaker() {
    const factory = Object.create(Circuitbreaker.prototype);
    var requests = [];
    var faults = [];

    factory.state = exports.CLOSED;

    const limitToWindow = function(windowSize) {
        debug(`Limit window size: ${windowSize}`);
        const compareTime = new Date().getTime() - windowSize;
        requests = requests.filter(r => r.time > compareTime);
        faults = faults.filter(f => f.time > compareTime);
        debug(`${requests.length} requests, ${faults.length} faults`);
    };

    factory.request = function(windowSize) {
        debug('Recording Request');
        limitToWindow(windowSize);
        requests.push({
            time: new Date().getTime()
        });
    };

    factory.fault = function(windowSize) {
        debug('Recording Fault');
        limitToWindow(windowSize);
        faults.push({
            time: new Date().getTime()
        });
    };

    factory.analyze = function(faultThreshold, lowLoadThreshold) {
        return faults.length / Math.max(requests.length, lowLoadThreshold) > faultThreshold;
    };

    factory.trip = function(duration) {
        debug(`Breaker tripping for ${duration}`);
        this.state = exports.OPEN;
        setTimeout(this.timeout, duration, this);
    };

    factory.reset = function() {
        debug('Breaker reset');
        this.state = exports.CLOSED;
    };

    factory.timeout = function(self) {
        debug('Timeout reached');
        debug(JSON.stringify(self, null, 2));
        self.state = exports.INDETERMINATE;
        debug('After state set');
        debug(JSON.stringify(self, null, 2));
    };

    return factory;
}

/**
 * Create a circuitbreaker object.
 * @param {object} [configuration={}]
 * @returns {object}
 */
exports.config = function (configuration) {
    const config = copy(schemas.circuitbreaker.normalize(configuration || {}), true);

    const request = function() {
        cb.request(config.windowSize);
    };

    const fault = function() {
        cb.fault(config.windowSize);
        if(cb.state === exports.INDETERMINATE || cb.analyze(config.errorThreshold, config.lowLoadThreshold)) {
            cb.trip(config.timeout);
        }
    };

    const success = function() {
        if(cb.state === exports.INDETERMINATE) {
            cb.reset();
        }
    };

    const state = function() {
        return cb.state;
    };

    // create the circuitbreaker object that will be returned
    const circuitbreaker = {
        request,
        fault,
        success,
        state
    };

    return circuitbreaker;
};
