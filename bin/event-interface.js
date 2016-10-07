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
const listeners = {};
var any = [];

exports.LOG = 'log';
exports.NOTIFICATION = 'notification';
exports.PUBLISH = 'publish';
exports.SNS = 'sns';
exports.SUBSCRIBE = 'subscribe';
exports.UNSUBSCRIBE = 'unsubscribe';

/**
 * Fire an event.
 * @param {string} type
 * @param {*} event
 * @returns {exports}
 */
exports.fire = function(type, event) {
    process.nextTick(function() {
        if (Array.isArray(listeners[type])) {
            listeners[type] = fire(listeners[type], event);
            if (!listeners[type].length) delete listeners[type];
        }
        any = fire(any, type, event);
    });
    return exports;
};

/**
 * Remove an event listener.
 * @param {string} [type]
 * @param {function} callback
 * @returns {exports}
 */
exports.off = function(type, callback) {
    if (typeof arguments[0] === 'function') {
        callback = arguments[1];
        const index = getIndex(any, callback);
        if (index !== -1) any.splice(index, 1);
    } else if (Array.isArray(listeners[type])) {
        const index = getIndex(listeners[type], callback);
        if (index !== -1) listeners[type].splice(index, 1);
        if (!listeners[type].length) delete listeners[type];
    }
    return exports;
};

/**
 * Add an event listener.
 * @param {string} [type]
 * @param {function} callback
 * @returns {exports}
 */
exports.on = function(type, callback) {
    if (typeof arguments[0] === 'function') {
        callback = arguments[0];
        const index = getIndex(any, callback);
        if (index === -1) any.push({ callback: callback, calls: 0, once: false });
    } else {
        if (!Array.isArray(listeners[type])) listeners[type] = [];
        const index = getIndex(listeners[type], callback);
        if (index === -1) listeners[type].push({ callback: callback, calls: 0, once: false });
    }
    return exports;
};

/**
 * Add an event listener that will be called at most once. Event listeners added in this manner cannot be removed.
 * @param {string} [type]
 * @param {function} callback
 * @returns {exports}
 */
exports.once = function(type, callback) {
    if (typeof arguments[0] === 'function') {
        callback = arguments[0];
        const index = getIndex(any, callback);
        if (index === -1) any.push({ callback: callback, calls: 0, once: true });
    } else {
        if (!Array.isArray(listeners[type])) listeners[type] = [];
        const index = getIndex(listeners[type], callback);
        if (index === -1) listeners[type].push({ callback: callback, calls: 0, once: true });
    }
    return exports;
};

function getIndex(listeners, callback) {
    var i;
    var item;
    for (i = 0; i < listeners.length; i++) {
        item = listeners[i];
        if (item.callback === callback && !item.once) return i;
    }
    return -1;
}

function fire(listeners, type, event) {
    const args = arguments;
    listeners.forEach(function(l) {
        if (!l.once || l.calls === 0) {
            if (args.length === 2) {
                l.callback(type);
            } else {
                l.callback(type, event);
            }
        }
        l.calls++;
    });
    return listeners.filter(function(l) { return !l.once || l.calls === 0 });
}