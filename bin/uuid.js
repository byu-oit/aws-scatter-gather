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
const uuid                  = require('uuid').v4;

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz01234567890'.split('');
const length = chars.length;

module.exports = function() {
    return uuid()
        .split('-')
        .map(function(v) {
            var num = parseInt(v, 16);
            var result = '';
            var mod;
            var quot;
            while (num > length) {
                mod = num % length;
                num = Math.floor(num / length);
                result = result + chars[mod];
            }
            return result;
        })
        .join('');
};