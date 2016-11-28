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
const chalk                 = require('chalk');
const debug                 = require('./debug')('aggregator', 'green');
const defer                 = require('./defer');
const EventInterface        = require('./event-interface');
const paradigm              = require('./paradigm');
const schemas               = require('./schemas');
const uuid                  = require('./uuid');

module.exports = function (configuration) {
    const config = schemas.request.normalize(configuration || {});
    return function(data, callback) {
        const promise = aggregator(config, data);
        return paradigm(promise, callback);
    };
};

function aggregator(config, data) {
    const responseArn = config.responseArn || config.topicArn;
    const deferred = defer();
    const event = {
        data: data,
        functionName: config.functionName,
        responseArn: responseArn,
        topicArn: config.topicArn,
        type: 'request',
        requestId: uuid()
    };
    const missing = config.expects.slice(0);
    const result = {};
    var minTimeoutReached = false;
    var pending = true;

    // if maximum delay is reached then resolve
    const maxTimeoutId = setTimeout(function() {
        if (pending) {
            pending = false;
            debug('Reached maximum wait time.', event);
            deferred.resolve(result);
        }
    }, config.maxWait);

    // if minimum delay is reached and nothing is missing then resolve
    setTimeout(function() {
        minTimeoutReached = true;
        if (missing.length === 0 && pending) {
            pending = false;
            clearTimeout(maxTimeoutId);
            debug('Reached minimum wait time', event);
            deferred.resolve(result);
        }
    }, config.minWait);

    // subscribe to responses until the gatherer completes
    EventInterface.on('response', event.responseArn, gatherer);
    debug('Subscribed ' + config.functionName + ' to response:' + event.responseArn, event);
    deferred.promise.then(unsubscribe, unsubscribe);

    // fire the event
    EventInterface.emit('request', event.topicArn, event);
    debug('Emitted ' + event.requestId + ' to request:' + event.topicArn + ' with data: ' + data, event);

    // return the promise
    return deferred.promise;


    // define the gatherer function
    function gatherer(received) {

        // if already resolved or rejected then exit now
        if (!pending) return;

        // verify that the event is being listened for
        if (received.requestId !== event.requestId) return;

        // delete reference from the wait map
        const index = missing.indexOf(received.functionName);
        if (index !== -1) missing.splice(index, 1);

        // store response
        if (!received.error) {
            result[received.functionName] = received.data;
            debug('Received response to request ' + received.requestId + ' from ' + received.functionName);
        } else {
            debug('Received response to request ' + received.requestId + ' from ' + received.functionName + ' as an error: ' + received.error);
        }

        // all expected responses received and min timeout passed, so resolve the deferred promise
        if (missing.length === 0) {
            clearTimeout(maxTimeoutId);
            debug('Received all expected responses for request ' + received.requestId);
            if (minTimeoutReached) {
                pending = false;
                deferred.resolve(result);
            }
        }
    }

    function unsubscribe() {
        EventInterface.off('response', event.responseArn, gatherer);
        debug('Unsubscribed ' + config.functionName + ' from response:' + event.responseArn, event);
    }
}