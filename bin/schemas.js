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
const AWS                   = require('aws-sdk');
const Schemata              = require('object-schemata');

exports.request = Schemata({
    expects: {
        defaultValue: [],
        help: 'This must be an array of strings.',
        validate: function(v) { return isArrayOfStrings(v); }
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

exports.response = Schemata({
    development: {
        defaultValue: false,
        transform: function(v) { return !!v; }
    },
    eventBased: {
        defaultValue: true,
        transform: function(v) { return !!v; }
    },
    functionName: {
        help: 'This must be a non-empty string.',
        validate: function(v, is) { return is.string(v) && v.length > 0; },
        required: true
    },
    handler: {
        help: 'This must be a function.',
        validate: function(v) { return typeof v === 'function'; },
        required: true
    }
});

exports.middleware = Schemata({
    endpoint: {
        help: 'This must be a valid URL.',
        validate: function(v, is) { return is.string(v) && /^https?:\/\/.+/; },
        required: true
    },
    passThrough: {
        defaultValue: false,
        transform: function(v) { return !!v; }
    },
    server: {
        help: 'Expected an instance of http server.',
        validate: function(v) { return v && typeof v.listen === 'function'; },
        required: true
    },
    sns: {
        help: 'Expected an AWS sns instance.',
        validate:function(v) { return v && v.config.constructor.name === 'Config' && v.endpoint.constructor.name === 'Endpoint' }
    },
    subscribe: {
        defaultValue: true,
        transform: function(v) { return !!v }
    },
    topics: {
        help: 'This must be an array of non-empty strings.',
        defaultValue: [],
        validate: function(v, is) {
            if (!Array.isArray(v)) return false;
            for (var i = 0; i < v.length; i++) {
                if (!v[0] || !is.string(v[0])) return false;
            }
            return true;
        }
    }
});

function isArrayOfStrings(v) {
    var i;
    if (!Array.isArray(v)) return false;
    for (i = 0; i < v.length; i++) {
        if (typeof v[i] !== 'string') return false;
    }
    return true;
}