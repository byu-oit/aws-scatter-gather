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
const aggregators       = require('./server/aggregators');
const Scather           = require('aws-scatter-gather');

const promises = [
    Scather.orchestrate('./responders/german/index'),
    Scather.orchestrate('./responders/spanish/index')
];

Promise.all(promises)
    .then(function() {
        // execute the aggregator using a callback paradigm
        aggregators.greetings('James', function(err, data) {

            // end orchestration so that the process can shut down
            Scather.orchestrate.end();
            console.log(err, data);
        });
    });