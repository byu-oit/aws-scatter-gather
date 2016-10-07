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
const AWS       = require('aws-sdk');
const Scather   = require('aws-scatter-gather');

exports.handler = function(event, context, callback) {

    // define the request configuration
    const aggregator = Scather.aggregator({
        expects: [ 'increment', 'double' ],
        responseArn: 'arn:aws:sns:us-west-2:064824991063:TopicX',
        topicArn: 'arn:aws:sns:us-west-2:064824991063:TopicY'
    });

    // make the request
    aggregator(5, function(err, data) {
        // ... run some code ...
        callback(err, data);
    });
};