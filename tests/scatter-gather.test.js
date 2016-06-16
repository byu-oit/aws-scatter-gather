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
const expect        = require('chai').expect;
const mocks         = require('./../test-resources/mocks');
const Promise       = require('bluebird');
const Scather       = require('../index');

describe('scatter-gather', function() {
    const scatherConfig = { name: 'scatter', endpoint: 'http://localhost:11200', port: 11200, topicArn: 'math' };
    var scather;
    
    beforeEach(function() {
        scather = Scather(mocks.sns, scatherConfig);
    });
    
    afterEach(function() {
        mocks.reset();
        return scather.end();
    });

    it('request property is function', function () {
        expect(scather.request).to.be.a('function');
    });

    it('response property is function', function () {
        expect(scather.response).to.be.a('function');
    });

    it('scatters', function(done) {
        const sendData = { number: 5 };

        mocks.lambda('increment', 'math', function(event, context, callback) {
            const message = JSON.parse(event.Records[0].Sns.Message);
            expect(message.data).to.deep.equal(sendData);
            done();
        });

        scather.request(sendData, { responses: ['increment'] });
    });

    it('response', function(done) {
        const sendData = { number: 5 };

        mocks.lambda('increment', 'math', scather.response(function(event, context, callback) {
            expect(event).to.deep.equal(sendData);
            done();
        }));

        scather.request(sendData, { responses: ['increment'] });
    });

    it('gathers one', function() {
        const start = Date.now();

        mocks.lambda('increment', 'math', scather.response(function(event, context, callback) {
            callback(null, event + 1);
        }));

        return scather.request(5, { responses: ['increment'] })
            .then(function(data) {
                expect(Date.now() - start).to.be.lessThan(3000);
                expect(Array.isArray(data)).to.equal(true);
                expect(data.complete).to.equal(true);
                expect(data.length).to.equal(1);
                expect(data.missing.length).to.equal(0);
                expect(data.additional.list.length).to.equal(0);
                expect(data.expected.list.length).to.equal(1);
                expect(data.expected.map).to.haveOwnProperty('increment');
                expect(data[0]).to.equal(data.expected.map.increment);
                expect(data[0].data).to.equal(6);
            });
    });

    it('gathers multiple', function() {
        const start = Date.now();

        mocks.lambda('increment', 'math', scather.response(function(event, context, callback) {
            callback(null, event + 1);
        }));

        mocks.lambda('double', 'math', scather.response(function(event, context, callback) {
            callback(null, event * 2);
        }));

        return scather.request(5, { responses: ['increment', 'double'] })
            .then(function(data) {
                expect(Date.now() - start).to.be.lessThan(3000);
                expect(Array.isArray(data)).to.equal(true);
                expect(data.complete).to.equal(true);
                expect(data.length).to.equal(2);
                expect(data.missing.length).to.equal(0);
                expect(data.additional.list.length).to.equal(0);
                expect(data.expected.list.length).to.equal(2);
                expect(data.map.increment.data).to.equal(6);
                expect(data.map.double.data).to.equal(10);
            });
    });

    it('gather open ended', function() {
        const start = Date.now();

        mocks.lambda('increment', 'math', scather.response(function(event, context, callback) {
            callback(null, event + 1);
        }));

        mocks.lambda('double', 'math', scather.response(function(event, context, callback) {
            callback(null, event * 2);
        }));

        return scather.request(5, { minWait: 1000 })
            .then(function(data) {
                expect(Date.now() - start).to.be.greaterThan(999);
                expect(Date.now() - start).to.be.lessThan(3000);
                expect(data.complete).to.equal(true);
                expect(data.length).to.equal(2);
                expect(data.missing.length).to.equal(0);
                expect(data.additional.list.length).to.equal(2);
                expect(data.expected.list.length).to.equal(0);
                expect(data.map.increment.data).to.equal(6);
                expect(data.map.double.data).to.equal(10);
            });
    });

    it('gather incomplete', function(done) {
        const start = Date.now();
        var requestCompleted = false;

        mocks.lambda('increment', 'math', scather.response(function(event, context, callback) {
            callback(null, event + 1);
        }));

        mocks.lambda('double', 'math', scather.response(function(event, context, callback) {
            setTimeout(function() {
                callback(null, event * 2);
                expect(Date.now() - start).to.be.greaterThan(1499);
                expect(requestCompleted).to.equal(true);
                done();
            }, 1500);
        }));

        scather.request(5, { maxWait: 1000, responses: ['increment', 'double'] })
            .then(function(data) {
                requestCompleted = true;
                expect(Date.now() - start).to.be.greaterThan(999);
                expect(data.complete).to.equal(false);
                expect(data.length).to.equal(1);
                expect(data.missing.length).to.equal(1);
                expect(data.additional.list.length).to.equal(0);
                expect(data.expected.list.length).to.equal(1);
                expect(data.map.increment.data).to.equal(6);
            });
    });

});