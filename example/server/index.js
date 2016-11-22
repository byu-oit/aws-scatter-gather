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
const aggregators       = require('./aggregators');
const AWS               = require('aws-sdk');
const express           = require('express');
const Scather           = require('../../index');

const app = express();

const sns = Scather.sns({
    endpoint: 'http://9b300c9c.ngrok.io',
    server: app,
    sns: new AWS.SNS({ region: 'us-west-2' }),
    subscribe: true,
    topics: ['arn:aws:sns:us-west-2:026968893061:speirs-temp']
});

// your server will now process AWS SNS Notifications, Subscription Confirmations, etc.
app.use(sns.middleware);

// listen for greet requests
app.get('/greet/{name}', function(req, res) {
    aggregators.greetings(req.params.name)
        .then(function(data) {
            res.status(200).json(data);
        })
        .catch(function(err) {
            console.error(err.stack);
            res.status(500).send('Internal server error');
        });
});

// start the server listening on port 3000
app.listen(3000, function () {
    aggregators.greetings('James')
        .then(console.log)
        .catch(function(err) {
            console.error(err.stack);
        });
});

