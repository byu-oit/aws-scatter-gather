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
const expect            = require('chai').expect;
const express           = require('express');
const Promise           = require('bluebird');
const Scather           = require('../index');

const server = Scather.server;

Promise.onPossiblyUnhandledRejection(noop);

describe('Scather.server', function() {
    var app;

    before(function(done) {
        app = express();
        app.use(server.middleware());
        app.listen(done);
    });

    after(function() {
        app.close();
    });

    


});

function noop() {}
