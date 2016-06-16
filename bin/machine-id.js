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
const Hashids       = require("hashids");

const interfaces = require('os').networkInterfaces();
const decodedValues = [];

Object.keys(interfaces).forEach(key => {
    const networkInterface = interfaces[key];
    if (networkInterface.length > 0) {
        const values = networkInterface[0].mac
            .split(':')
            .map(v => parseInt(v, 16));
        decodedValues.push.apply(decodedValues, values);
    }
});

const hashids = new Hashids('machine-id');
const machineId = hashids.encode(decodedValues);

// export the unique id
Object.defineProperty(module, 'exports', {
    configurable: false,
    writable: false,
    value: machineId
});