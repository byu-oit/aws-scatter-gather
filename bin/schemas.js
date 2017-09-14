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
const uuid                  = require('./uuid');

exports.event = Schemata({
    data: {
        required: true
    },
    error: {
        defaultValue: '',
        validate: function(v) { return typeof v === 'string'; }
    },
    name: {
        help: 'This must be a non-empty string.',
        required: true,
        validate: nonEmptyString
    },
    requestId: {
        required: true,
        validate: nonEmptyString
    },
    responseArn: {
        help: 'This must be a non-empty string.',
        validate: nonEmptyString
    },
    topicArn: {
        help: 'This must be a non-empty string.',
        required: true,
        validate: nonEmptyString
    },
    type: {
        help: 'This must be a non-empty string.',
        required: true,
        validate: function(v) { return v === 'request' || v === 'response' }
    },
    circuitbreakerState: {
        help: 'This must be a valid circuitbreaker state.',
        validate: function(v) { return v === 'open' || v === 'closed' || v === 'indeterminate' }
    },
    circuitbreakerFault: {
        defaultValue: false
    },
    circuitbreakerSuccess: {
        defaultValue: false
    }
});

exports.request = Schemata({
    composer: {
        defaultValue: function(value, callback) { callback(null, value) },
        help: 'This must be a function.',
        validate: function(v) { return typeof v === 'function' }
    },
    each: {
        help: 'A function to call with each response.',
        validate: function(v) { return typeof v === 'function' }
    },
    expects: {
        defaultValue: [],
        help: 'This must be an array of strings.',
        validate: function(v) { return isArrayOfStrings(v); }
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
    name: {
        defaultValue: '-',
        help: 'This must be a non-empty string.',
        validate: function(v, is) { return is.string(v) && v.length > 0; }
    },
    responseArn: {
        defaultValue: '',
        help: 'This must be a string.',
        validate: function(v, is) { return is.string(v); }
    },
    sns: {
        help: 'This must be an sns instance.'
    },
    topicArn: {
        required: true,
        help: 'This must be a non-empty string.',
        validate: function(v, is) { return is.string(v) && v.length > 0; }
    },
    circuitbreaker: {
        help: 'Expected a Circuitbreaker instance.',
        validate: function(v) { return v && v.state }
    }
});

exports.response = Schemata({
    name:{
        help: 'This must be a non-empty string.',
        validate: nonEmptyString,
        required: true
    },
    sns: {
        help: 'Expected an AWS sns instance.',
        validate:function(v) { return v && v.config.constructor.name === 'Config' && v.endpoint.constructor.name === 'Endpoint' }
    },
    topics: {
        help: 'This must be an array of non-empty strings.',
        defaultValue: [],
        validate: function(v, is) {
            if (!Array.isArray(v)) return false;
            for (var i = 0; i < v.length; i++) {
                if (!v[i] || !is.string(v[i])) return false;
            }
            return true;
        }
    },
    handler: {
        required: true,
        help: 'This must be a named function.',
        validate: function(v, is) { return is.fn(v) && !!v.name; }
    },
    bypass: {
        help: 'This must be a named function.',
        validate: function(v, is) { return is.fn(v) && !!v.name; }
    }
});

exports.middleware = Schemata({
    endpoint: {
        help: 'This must be a valid URL.',
        validate: function(v, is) { return is.string(v) && /^https?:\/\/.+/; },
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
        defaultValue: [],
        validate: function(v, is) {
            if (!Array.isArray(v)) return false;
            for (var i = 0; i < v.length; i++) {
                if (!v[i] || !is.string(v[i])) return false;
            }
            return true;
        }
    },
    useBodyParser: {
        defaultValue: true,
        transform: function(v) { return !!v }
    }
});

exports.circuitbreaker = Schemata({
    timeout: {
        help: 'Expected a positive integer',
        validate: function(v, is) { return is.integer(v) && is.gt(v, 0); },
        defaultValue: 1000 * 60 * 5
    },
    errorThreshold: {
        help: 'Expected a fraction between 0 and 1 (not inclusive)',
        validate: function(v, is) { return is.decimal(v) && is.gt(v,0) && is.lt(v,1); },
        defaultValue: 0.1
    },
    lowLoadThreshold: {
        help: 'This must be a positive integer',
        validate: function(v, is) { return is.integer(v) && is.gt(v, 0); },
        defaultValue: 300
    },
    windowSize: {
        help: 'This must be a positive integer',
        validate: function(v, is) { return is.integer(v) && is.gt(v, 0); },
        defaultValue: 1000 * 60 * 30
    },
});

function nonEmptyString(v) {
    return typeof v === 'string' && v.length > 0;
}

function isArrayOfStrings(v) {
    var i;
    if (!Array.isArray(v)) return false;
    for (i = 0; i < v.length; i++) {
        if (typeof v[i] !== 'string') return false;
    }
    return true;
}
