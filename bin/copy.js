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
module.exports = function(value, freeze) {
    return copy(value, freeze);
};

function copy(value, freeze, map) {
    if (Array.isArray(value)) {
        if (!map) map = new WeakMap();
        if (map.has(value)) {
            return map.get(value);
        } else {
            const ar = [];
            map.set(value, ar);
            value.forEach(function (v, i) {
                ar[i] = copy(v, freeze, map);
            });
            if (freeze) Object.freeze(ar);
            return ar;
        }
    } else if (typeof value === 'object' && value.constructor === Object) {
        if (value === null) return null;
        if (!map) map = new WeakMap();
        if (map.has(value)) {
            return map.get(value);
        } else {
            const obj = {};
            map.set(value, obj);
            Object.keys(value).forEach(function(key) {
                obj[key] = copy(value[key], freeze, map);
            });
            if (freeze) Object.freeze(obj);
            return obj;
        }
    } else {
        return value;
    }
}