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
const debug                 = require('./debug')('response', 'magenta');
const defer                 = require('./defer');
const EventInterface        = require('./event-interface');
const schemas               = require('./schemas');

module.exports = function(configuration) {
    var preRunError;

    // normalize the configuration
    var config;
    try {
        config = schemas.response.normalize(configuration || {});
    } catch (e) {
        preRunError = e;
    }

    const handlerTakesCallback = !preRunError && callbackArguments(config.handler).length >= 3;
    function responseHandler(event) {
        const deferred = defer();
        debug('Received ' + event.requestId + ' from request:' + event.topicArn + ' with data: ' + event.data);

        // attempt to execute the handler
        event = Object.assign({}, event, { functionName: config.functionName });
        try {
            // pre-run error
            if (preRunError) {
                deferred.reject(preRunError);

                // callback paradigm
            } else if (handlerTakesCallback) {
                config.handler(event.data, event, function (err, data) {
                    if (err) return deferred.reject(err);
                    deferred.resolve(data);
                });

                // promise paradigm
            } else {
                deferred.resolve(config.handler(event.data, event));
            }
        } catch (err) {
            deferred.reject(err);
        }

        // publish an event with the response
        return deferred.promise
            .then(
                function(message) { return sendResponse(null, message, event, config.eventBased); },
                function(err) { return sendResponse(config.development ? err.stack : err.message , null, event, config.eventBased); }
            );
    }

    // if event based then subscribe to events and return unsubscribe, otherwise return handler
    if (config.eventBased) {
        // set up a listener for request events
        EventInterface.on('request', responseHandler);
        debug('Subscribed ' + config.functionName + ' to request:*');

        // return a function that can be used to end the response handler
        return function () {
            EventInterface.off('request', responseHandler);
            debug('Unsubscribed ' + config.functionName + ' from request:*');
        }
    } else {
        return responseHandler;
    }
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

function sendResponse(err, data, context, eventBased) {
    const event = {
        data: data,
        error: err,
        functionName: context.functionName,
        topicArn: context.responseArn,
        type: 'response',
        requestId: context.requestId
    };
    if (eventBased) {
        EventInterface.emit('response', context.responseArn, event);
        debug('Emitted ' + event.requestId + ' to response:' + event.topicArn + ' with ' + (err ? 'error: ' + err : 'data: ' + data));
    }
    return event;
}