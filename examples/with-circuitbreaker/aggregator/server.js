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
const AWS = require('aws-sdk');
const express = require('express');
const Scather = require('aws-scatter-gather');

// create an express app
const app = express();

// create a circuitbreaker
const circuitbreaker = Scather.circuitbreaker.config({
  // trip for 1 minute
  timeout: 1000 * 60,
  // trip if errors exceed 10% of requests
  errorThreshold: 0.1,
  // don't trip breaker on first fault if less than 10 requests per window
  lowLoadThreshold: 10,
  // Ten minute window
  windowSize: 1000 * 60 * 10
});

// add the scather sns middleware
app.use(Scather.middleware({
    endpoint: 'http://url-to-this-server.com',
    server: app,
    sns: new AWS.SNS({ region: 'us-west-2' }),
    topics: ['arn:aws:sns:us-west-2:064824991063:ResponseTopic']
}));

const echoes = Scather.aggregator({
    composer: function(responses) {
        const str = Object.keys(responses)
            .map(function(source) {
                return source + ': ' + responses[source];
            })
            .join('\n\t');
        return 'Echo from multiple sources: \n\t' + str;
    },
    expects: ['service'],
    maxWait: 2500,
    minWait: 0,
    responseArn: 'arn:aws:sns:us-west-2:064824991063:ResponseTopic',
    topicArn: 'arn:aws:sns:us-west-2:064824991063:RequestTopic',
    circuitbreaker: circuitbreaker
});

// start the server listening on port 3000
app.listen(3000, function() {
    console.log('Server listening on port 3000');

    // aggregate results through the SNS Topics - using callback paradigm
    echoes('EchoThisBack', function(err, data) {
        if(err) {
          console.error(JSON.stringify(err));
        }
        console.log(JSON.stringify(data));
    });

});
