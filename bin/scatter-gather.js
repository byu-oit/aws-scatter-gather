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
const defer             = require('./defer');
const EventRecord       = require('./event-record');
const EventInterface    = require('./event-interface');
const Log               = require('./log');
const Subscriptions     = require('./subscription');
const schemas           = require('./schemas');
const uuid              = require('uuid').v4;

const Req = Log('SCATHER_REQUEST');
const Res = Log('SCATHER_RESPONSE');

/**
 * Create an aggregator function that can be called to make scatter-gather requests.
 * @param {object} configuration
 * @returns {aggregator}
 */
exports.aggregator = function(configuration) {
    const config = schemas.request.normalize(configuration || {});
    const responseArn = config.responseArn || config.topicArn;
    const gatherers = [];

    // subscribe the aggregator to the topic arn
    Subscriptions.subscribe(responseArn, config.functionName, runGatherers);

    // define the aggregator function
    function aggregator(data, callback) {
        if (!aggregator.subscribed) {
            return Promise.reject(Error('Request aggregator has been unsubscribed. It will no longer gather requests.'));
        }

        const attributes = {
            ScatherDirection: 'request',
            ScatherFunctionName: config.functionName,
            ScatherResponseArn: responseArn,
            ScatherRequestId: uuid()
        };
        const deferred = defer();
        const event = EventRecord.createPublishEvent(config.topicArn, data, attributes);
        const missing = config.expects.slice(0);
        const result = {};
        var minTimeoutReached = false;

        // if minimum delay is reached and nothing is missing then resolve
        setTimeout(function() {
            minTimeoutReached = true;
            if (missing.length === 0 && deferred.promise.isPending()) deferred.resolve(result);
        }, config.minWait);

        // if maximum delay is reached then resolve
        setTimeout(function() {
            if (deferred.promise.isPending()) deferred.resolve(result);
        }, config.maxWait);

        // publish the request event
        EventInterface.fire(EventInterface.PUBLISH, event);
        Req.info('Sent request ' + attributes.ScatherRequestId + ' to topic ' + config.topicArn + ' with data: ' + data);

        // store active data
        const active = {
            gatherer: gatherer,
            promise: deferred.promise
        };
        gatherers.push(active);

        // remove active data once promise is not pending
        deferred.promise.finally(function() {
            const index = gatherers.indexOf(active);
            gatherers.slice(index, 1);
        });

        // define the gatherer
        function gatherer(event) {

            // if already resolved or not subscribed then exit now
            if (!deferred.promise.isPending()) return;

            // pull records out of the event that are responses to the request event
            const records = EventRecord.extractScatherRecords(event, function(data) {
                return data.attributes.ScatherDirection === 'response' &&
                    data.attributes.ScatherRequestId === attributes.ScatherRequestId;
            });

            // process each record and store
            records.forEach(function(record) {
                const attr = record.attributes;
                const isError = attr.ScatherResponseError;
                const reqId = attributes.ScatherRequestId;
                const senderName = attr.ScatherFunctionName;

                // delete reference from the wait map
                const index = missing.indexOf(senderName);
                if (index !== -1) missing.splice(index, 1);

                // store the result (if it's not an error)
                if (!isError) {
                    result[senderName] = record.message;
                    Req.info('Received response to request ' + reqId + ' from ' + senderName);
                } else {
                    Req.warn('Received response to request ' + reqId + ' from ' + senderName + ' as an error: ' + record.message);
                }
            });

            // all expected responses received and min timeout passed, so resolve the deferred promise
            if (missing.length === 0 && minTimeoutReached) {
                deferred.resolve(result);
            }
        }

        // use appropriate async paradigm
        return defer.paradigm(deferred.promise, callback);
    }

    // run all gatherers that are active
    function runGatherers(event) {
        gatherers.forEach(function(item) { item.gatherer(event) });
    }
    
    // unsubscribe the aggregator
    function unsubscribe() {
        const promises = [];
        aggregator.subscribed = false;
        gatherers.forEach(function(item) { promises.push(item.promise.catch(fnUndefined)) });
        return Promise.all(promises)
            .then(function() {
                return Subscriptions.unsubscribe(responseArn, runGatherers);
            });
    }

    // add some properties to the aggregator function
    aggregator.subscribed = true;
    aggregator.unsubscribe = unsubscribe;

    return aggregator;
};

/**
 * Wrap a lambda function so that it only works on event records that represent scather requests.
 * @param {object} [configuration]
 * @param {function} handler A function with signature: function (data, metadata [, callback ]). If the callback is omitted then the returned value will be used.
 * @returns {Function}
 */
exports.response = function(configuration, handler) {
    var error;

    // validate input parameters
    if (arguments.length === 0) {
        error = Error('Scather.response missing required handler parameter.');
    } else if (arguments.length === 1) {
        handler = arguments[0];
    }
    if (typeof handler !== 'function') error = Error('Scather.response missing required handler parameter.');

    // normalize the configuration
    var config;
    try {
        if (!configuration || typeof configuration !== 'object') configuration = {};
        config = schemas.response.normalize(configuration);
    } catch (e) {
        error = e;
    }

    // define a function that will send the response
    function sendResponse(isError, message, context) {
        const event = EventRecord.createPublishEvent(context.scather.ScatherResponseArn, message, {
            ScatherDirection: 'response',
            ScatherFunctionName: context.functionName,
            ScatherResponseArn: context.scather.ScatherResponseArn,
            ScatherResponseError: isError,
            ScatherRequestId: context.scather.ScatherRequestId
        });
        EventInterface.fire(EventInterface.PUBLISH, event);
        Res.info('Sent response for ' + context.scather.ScatherRequestId +
            ' to topic ' + context.scather.ScatherResponseArn + ' with data: ' + message);
    }

    const handlerTakesCallback = !error && callbackArguments(handler).length >= 3;
    return function(event, context, callback) {
        const promises = [];

        // validate the context
        if (!context || typeof context !== 'object') throw Error('Invalid context. Expected an object.');
        if (!context.functionName || typeof context.functionName !== 'string') throw Error('Invalid context functionName. Value must be a non-empty string.');

        const records = EventRecord.extractScatherRecords(event, function(r) {
            return r.attributes.ScatherDirection === 'request';
        });
        records.forEach(function(record) {
            const deferred = defer();
            promises.push(deferred.promise);

            Res.info('Responding to event data: ' + record.message);

            // add attributes to context
            const innerContext = Object.assign({}, context);
            innerContext.scather = record.attributes;

            // pre-run error
            if (error) {
                deferred.reject(error);

            // callback paradigm
            } else if (handlerTakesCallback) {
                try {
                    handler(record.message, innerContext, function (err, data) {
                        if (err) return deferred.reject(err);
                        deferred.resolve(data);
                    });
                } catch (err) {
                    deferred.reject(err);
                }

            // promise paradigm
            } else {
                try {
                    const result = handler(record.message, innerContext);
                    deferred.resolve(result);
                } catch (err) {
                    deferred.reject(err);
                }
            }

            // publish an event with the response
            deferred.promise
                .then(
                    function(message) { sendResponse(false, message, innerContext); },
                    function(err) { if (config.development) sendResponse(true, err.stack, innerContext); }
                );

        });

        // get a promise that all records have been processed
        const promise = Promise.all(promises);
        promise.then(function() {
            Res.info('Responded to ' + records.length + ' records');
        });

        // respond to callback or promise paradigm
        if (handlerTakesCallback) {
            promise.then(function(data) { callback(null, data); }, function(err) { callback(err, null); });
        } else {
            return promise;
        }
    };
};

function callbackArguments(callback) {
    if (typeof callback !== 'function') throw Error('Expected a function.');

    const rx = /^(?:function\s?)?([\s\S]+?)\s?(?:=>\s?)?\{/;
    const match = rx.exec(callback.toString());

    var args = match[1];
    if (/^\([\s\S]*?\)$/.test(args)) args = args.substring(1, args.length - 1);
    args = args.split(/,\s?/);

    return args && args.length === 1 && !args[0] ? [] : args;
}









function fnUndefined() {
    return undefined;
}