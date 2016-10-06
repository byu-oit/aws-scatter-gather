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
const Schemata          = require('object-schemata');

exports.request = Schemata({
    expects: {
        defaultValue: [],
        help: 'This must be an array of strings.',
        validate: function(v, is) { return isArrayOfStrings(v); }
    },
    functionName: {
        defaultValue: '-',
        help: 'This must be a non-empty string.',
        validate: function(v, is) { return is.string(v) && v.length > 0; }
    },
    maxWait: {
        defaultValue: 2500,
        help: 'This must be a non-negative number.',
        transform: function(v) { return Math.round(v); },
        validate: function(v, is) { return !is.nan(v) && parseInt(v) >= 0; }
    },
    minWait: {
        defaultValue: 0,
        help: 'This must be a non-negative number.',
        transform: function(v) { return Math.round(v); },
        validate: function(v, is) { return !is.nan(v) && parseInt(v) >= 0; }
    },
    responseArn: {
        defaultValue: '',
        help: 'This must be a string.',
        validate: function(v, is) { return is.string(v); }
    },
    topicArn: {
        required: true,
        help: 'This must be a non-empty string.',
        validate: function(v, is) { return is.string(v) && v.length > 0; }
    }
});

exports.middleware = Schemata({
    passThrough: {
        defaultValue: false,
        transform: function(v) { return !!v; }
    }
    /*endpoint: {
        defaultValue: '',
        help: 'If set, the endpoint must begin with http or https and define the entire url endpoint.',
        validate: function(v, is) { return is.string(v) && (!v || /^https?:\/\//i.test(v)); }
    },
    port: {
        defaultValue: 0,
        help: 'The port must be a non-negative number.',
        validate: function(v, is) { return !is.nan(v) && v >= 0; }
    },
    tunnel: {
        defaultValue: false,
        help: 'Set to true to enable tunneling with defaults, otherwise specify and ngrok configuration object.',
        validate: function(v, is) { return is.boolean(v) || is.object(v); }
    }*/
});

function isArrayOfStrings(v) {
    var i;
    if (!Array.isArray(v)) return false;
    for (i = 0; i < v.length; i++) {
        if (typeof v[i] !== 'string') return false;
    }
    return true;
}