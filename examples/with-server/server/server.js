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

// create the sns instance
const sns = new AWS.SNS({ region: 'us-west-2' });

// create an express app and add the scather sns middleware
const app = express();
app.use(Scather.middleware({
    endpoint: 'http://url-to-this-server.com',
    server: app,
    sns: sns,
    topics: ['arn:aws:sns:us-west-2:064824991063:RequestTopic']
}));

Scather.response({
    name: 'Chinese',
    sns: sns,
    handler: function (data) {
        return 'Ni hao, ' + data;
    }
});

// start the server listening on port 3001
app.listen(3001, function() {
    console.log('Server listening on port 3001');
});
