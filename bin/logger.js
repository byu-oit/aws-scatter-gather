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

module.exports = Logger;

function Logger(enabled) {
    const factory = Object.create(Logger.prototype);

    factory.enabled = arguments.length > 0 ? enabled : true;

    return factory;
}

Logger.prototype.error = function() {
    if (this.enabled) console.error.apply(console, arguments);
};

Logger.prototype.log = function() {
    if (this.enabled) console.log.apply(console, arguments);
};