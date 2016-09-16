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
const EventInterface    = require('./event-interface');
var defaultSilent = true;
var logEvents = false;

module.exports = Logger;

/**
 * Create a logger.
 * @param {string} namespace
 * @param {boolean} [silent]
 * @returns {Logger}
 * @constructor
 */
function Logger(namespace, silent) {
    var silentSpecified = arguments.length > 1;
    namespace = setStringToLength(namespace.toUpperCase(), 16);

    const factory = Object.create(Logger.prototype);

    Object.defineProperty(factory, 'silent', {
        get: () => silentSpecified ? silent : defaultSilent,
        set: v => silent = !!v
    });

    /**
     * @name Logger#error
     * @params {*} data...
     */
    factory.error = fire('error');

    /**
     * @name Logger#info
     * @params {*} data...
     */
    factory.info = fire('info');

    /**
     * @name Logger#warn
     * @params {*} data...
     */
    factory.warn = fire('warn');

    function fire(level) {
        level = level.toUpperCase();
        return function() {
            EventInterface.fire(EventInterface.LOG, {
                args: arguments,
                level: level,
                namespace: namespace,
                silent: factory.silent
            });
        }
    }

    return factory;
}

/**
 * Get or set the default event logging for the logger. If true then all events will be logged to the console.
 * @name #events
 * @type {boolean}
 */
Object.defineProperty(Logger, 'events', {
    get: () => logEvents,
    set: v => {
        v = !!v;
        if (logEvents !== v) {
            if (v) {
                EventInterface.on(eventLogger);
            } else {
                EventInterface.off(eventLogger);
            }
        }
        logEvents = v;
    }
});

/**
 * Get or set the default silence for the logger. If silent then logs will not hit the console.
 * Either way logs will be posted the the event interface.
 * @name #silent
 * @type {boolean}
 */
Object.defineProperty(Logger, 'silent', {
    get: () => defaultSilent,
    set: v => defaultSilent = !!v
});

// handle log events
EventInterface.on(EventInterface.LOG, function (event) {
    if (!event.silent) {
        const args = Array.prototype.slice.call(event.args, 0);
        args.unshift(event.namespace);
        args.unshift(setStringToLength(event.level, 5));
        console.log.apply(console, args);
    }
});

function setStringToLength(str, length) {
    str = str.substr(0, length);
    while (str.length < length) str += ' ';
    return str;
}

function eventLogger(type, event) {
    console.log(type.toUpperCase() + ': ' + JSON.stringify(event, null, 2));
}