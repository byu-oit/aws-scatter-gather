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
const Scather = require('aws-scatter-gather');
const request = require('request');
const AWS = require('aws-sdk');
const SNS = new AWS.SNS({ region: 'us-west-2', apiVersion: '2010-12-01' });

const snsArn = 'arn:aws:sns:us-west-2:064824991063:ResponseTopic';

exports.response = Scather.response(function service(data) {
    const url = `http://echo.jsontest.com/data/${data}`;
    return new Promise(function(resolve, reject) {
        request(url, function(error, response, body) {
            //Simulate an intermittently faulty connection
            if(Math.random() < 0.2) {
                Scather.circuitbreaker.sendFaultAlert(SNS, snsArn);
            } else {
                Scather.circuitbreaker.sendSuccessAlert(SNS, snsArn);
            }
            if(error) {
                return reject(error);
            }
            if(response.statusCode !== 200) {
                return reject({
                  statusCode: response.statusCode
                });
            }
            return resolve(body);
        });
    });
});

exports.bypass = Scather.response(function bypass(data) {
    return JSON.stringify({
      data: 'Bypassed by circuit breaker'
    });
});

exports.handler = Scather.lambda({responder: exports.response, bypass: exports.bypass});
