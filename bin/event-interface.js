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

const subscriptions = HandlerMap();

/**
 * Emit an event.
 * @param {*} event
 */
exports.emit = function(event) {
    const args = evaluateArguments(arguments);
    process.nextTick(function() {
        subscriptions.execute(args.keys, args.data);
    });
};

/**
 * Stop listening for an event.
 * @param {function} handler
 */
exports.off = function(handler) {
    const args = evaluateArguments(arguments);
    subscriptions.unset(args.keys, args.data);
};

/**
 * Start listening for an event.
 * @param {string} [name]
 * @param {string} [id]
 * @param {function} handler
 */
exports.on = function(name, id, handler) {
    const args = evaluateArguments(arguments);
    subscriptions.set(args.keys, args.data);
};

function HandlerMap() {
    const factory = Object.create(HandlerMap.prototype);
    const children = new Map();
    const handlers = [];

    factory.execute = function(keys, event) {
        const key = keys[0];
        if (children.has(key)) {
            children.get(key).execute(keys.slice(1), event);
            runHandlers(handlers, event);
        }
        runHandlers(handlers, event);
    };

    factory.isEmpty = function() {
        return handlers.length + children.size === 0;
    };

    factory.set = function(keys, handler) {
        const key = keys[0];
        if (keys.length === 0) {
            if (typeof handler !== 'function') throw Error('Invalid event listener. Expected function. Received: ' + handler);
            handlers.push(handler);
        } else if (children.has(key)) {
            children.get(key).set(keys.slice(1), handler);
        } else {
            const map = HandlerMap();
            map.set(keys.slice(1), handler);
            children.set(key, map);
        }
    };

    factory.unset = function(keys, handler) {
        const key = keys[0];
        if (keys.length === 0) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        } else if (children.has(key)) {
            children.get(key).unset(keys.slice(1), handler);
            if (children.get(key).isEmpty()) children.delete(key);
        }
    };

    return factory;
}

function evaluateArguments(args) {
    const keys = [];
    var i;
    for (i = 0; i < args.length - 1; i++) keys.push(args[i]);
    return {
        data: args[args.length - 1],
        keys: keys
    }
}

function runHandlers(handlers, event) {
    handlers.forEach(function(handler) {
        handler(event);
    });
}