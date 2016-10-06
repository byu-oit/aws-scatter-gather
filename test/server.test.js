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
const AWS               = require('aws-sdk');
const expect            = require('chai').expect;
const express           = require('express');
const Promise           = require('bluebird');
const Scather           = require('../index');
const uuid              = require('uuid').v4;

const server = Scather.server;

Promise.onPossiblyUnhandledRejection(noop);

describe('Scather.server', function() {
    const topicName = 'ScatherTest-' + uuid();
    var app;
    var server;

    before(function(done) {
        const promises = [];

        // start an express server
        app = express();
        app.use(server.middleware());
        promises.push(new Promise(function(resolve, reject) {
            server = app.listen(function(err) {
                if (err) return reject(err);
                resolve(server)
            });
        }));

        // create an sns topic
        createSnsTopic(topicName)
    });

    after(function() {
        server.close();
        return deleteSnsTopic(topicName);
    });

    it('can subscribe to sns topic', function() {
        server.subscribe()
    });

});



function noop() {}
