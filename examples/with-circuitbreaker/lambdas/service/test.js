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

const lambda = require('./index');

// call normally

// callback paradigm
lambda.response('EchoThisBack', 'closed', function(err, data) {
    if(err) {
        console.error('closed cb', err);
        return;
    }
    console.log('closed cb', data);
});

// promise paradigm
lambda.response('EchoThisBack', 'closed')
    .then(function(data) {
        console.log('closed promise', data);
    })
    .catch(function(err) {
        console.error('closed promise', err);
    });

// expect bypass

// callback paradigm
lambda.response('EchoThisBack', 'open', function(err, data) {
    console.log('open cb', data);
});

// promise paradigm
lambda.response('EchoThisBack', 'open')
    .then(function(data) {
        console.log('open promise', data);
    });
