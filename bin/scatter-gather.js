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
const Orchestrate       = require('./orchestrate');
const schemas           = require('./schemas');
const uuid              = require('uuid').v4;

const Req = Log('SCATHER_REQUEST');
const Res = Log('SCATHER_RESPONSE');

exports.request = function(data, configuration, callback) {
    const config = schemas.request.normalize(configuration || {});
    const attributes = {
        ScatherDirection: 'request',
        ScatherFunctionName: config.functionName,
        ScatherResponseArn: config.responseArn || config.topicArn,
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

    // define the gatherer
    function gatherer(event) {

        // if already resolved then exit now
        if (!deferred.promise.isPending()) return;

        // pull records out of the event that a responses to the request event
        const records = EventRecord.extractScatherRecords(event, function(data, record) {
            return data.attributes.ScatherDirection === 'response' &&
                data.attributes.ScatherRequestId === attributes.ScatherRequestId;
        });

        // process each record and store
        records.forEach(record => {
            const senderName = record.attributes.ScatherFunctionName;

            // delete reference from the wait map
            const index = missing.indexOf(senderName);
            if (index !== -1) missing.splice(index, 1);

            // store the result
            result[senderName] = record.message;

            Req.info('Received response to request ' + attributes.ScatherRequestId + ' from ' + senderName);
        });

        // all expected responses received and min timeout passed, so resolve the deferred promise
        if (missing.length === 0 && minTimeoutReached) {
            deferred.resolve(result);
        }
    }

    // start listening for notification events
    Orchestrate.on(attributes.ScatherResponseArn, attributes.ScatherFunctionName, gatherer);
    
    // publish the request event
    EventInterface.fire(EventInterface.PUBLISH, event);
    Req.info('Sent request ' + attributes.ScatherRequestId + ' to topic ' + config.topicArn + ' with data: ' + data);

    // once the gatherer finishes then unsubscribe the gatherer from the event
    deferred.promise.finally(() => {
        Orchestrate.off(attributes.ScatherResponseArn, gatherer);
    });

    // return a promise or call the callback
    if (typeof callback !== 'function') {
        return deferred.promise.then(() => result);
    } else {
        deferred.promise.then(() => callback(null, result), e => callback(e, null));
    }
};

/**
 * Wrap a lambda function so that it only works on event records that represent scather requests.
 * @param {function} handler A function with signature: function (data, metadata [, callback ]). If the callback is omitted then the returned value will be used.
 * @returns {Function}
 */
exports.response = function(handler) {
    const handlerTakesCallback = callbackArguments(handler).length >= 3;
    return function(event, context, callback) {
        const promises = [];
        const hasCallback = typeof arguments[2] === 'function';

        // validate the context
        context = schemas.context.normalize(context || {});

        EventRecord.extractScatherRecords(event, r => r.attributes.ScatherDirection === 'request').forEach(record => {
            const deferred = defer();
            promises.push(deferred.promise);

            // callback paradigm
            if (handlerTakesCallback) {
                handler(record.message, record.attributes, function(err, data) {
                    if (err) return deferred.reject(err);
                    deferred.resolve(data);
                });

            // promise paradigm
            } else {
                try {
                    const result = handler(record.message, record.attributes);
                    deferred.resolve(result);
                } catch (err) {
                    deferred.reject(err);
                }
            }

            // publish an event with the response
            deferred.promise
                .then(message => {
                    const event = EventRecord.createPublishEvent(record.attributes.ScatherResponseArn, message, {
                        ScatherDirection: 'response',
                        ScatherFunctionName: context.functionName,
                        ScatherResponseArn: record.attributes.ScatherResponseArn,
                        ScatherRequestId: record.attributes.ScatherRequestId
                    });
                    EventInterface.fire(EventInterface.PUBLISH, event);
                    Res.info('Sent response for ' + record.attributes.ScatherRequestId +
                        ' to topic ' + record.attributes.ScatherResponseArn + ' with data: ' + message);
                });

        });

        // get a promise that all records have been processed
        const promise = Promise.all(promises);

        // respond to callback or promise paradigm
        if (hasCallback) {
            promise.then(results => callback(null, results), err => callback(err, null));
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















/**
 * Build an object that represents the parameters to publish to an SNS Topic.
 * @param topicArn
 * @param [responseArn]
 * @returns {object}
 */
function buildRequestSnsParams(topicArn, responseArn) {
    const isObject = typeof event === 'object';

    const context = {
        json: isObject,
        responseArn: responseArn || topicArn,
        requestId: uuid()
    };

    return {
        Message: isObject ? JSON.stringify(event) : event,
        MessageAttributes: {
            ScatherRequest: {
                DataType: 'String',
                StringValue: JSON.stringify(context)
            }
        },
        TopicArn: topicArn
    };
}

