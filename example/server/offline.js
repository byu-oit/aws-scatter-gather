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
//process.env.DEBUG = '*';
const aggregators       = require('./aggregators');
const Scather           = require('../../index');

const promises = [
    Scather.orchestrate('../responders/german/index')
    , Scather.orchestrate('../responders/spanish/index')
];

Promise.all(promises)
    .then(function() {
        // execute the aggregator using a callback paradigm
        aggregators.greetings('James', function(err, data) {
            Scather.orchestrate.end();
            console.log(err, data);
        });
    });

















/*























// don't sent events to or receive events from aws lambda
Scather.server.enabled = false;

// log all events to the console
Scather.logger.silent = false;
//Scather.logger.events = true;

const aggregators       = require('./aggregators');

// include lambda index files
const responders = {
    //english             : require('../responders/english/index'),
    //german              : require('../responders/german/index'),
    //french              : require('../responders/french/index'),
    spanish             : require('../responders/spanish/index')
};

console.log('here');

// create a mock subscription for the responders
const requestArn = 'TopicX';
//Scather.local.subscribe(requestArn, 'english', responders.english.handler);
//Scather.local.subscribe(requestArn, 'french', responders.french.handler);
//Scather.local.subscribe(requestArn, 'german', responders.german.handler);
Scather.local.subscribe(requestArn, 'spanish', responders.spanish.handler);

// execute the aggregator using a callback paradigm
aggregators.greet('Tom', function(err, data) {
    console.log(err, data);
});*/

// execute the aggregator using a promise paradigm
/*
aggregators.greet('Sandy')
    .then(function(data) {
        console.log(data);
    });*/
