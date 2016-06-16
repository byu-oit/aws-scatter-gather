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

describe('mocks', function() {

    describe('#lambda', function() {

        afterEach(mocks.reset);

        it('is subscribed', function(done) {
            const params = {
                Message: 'Hello, World!',
                Subject: 'Hello Subject',
                TopicArn: 'math'
            };

            mocks.lambda('increment', 'math', function (event, context, callback) {
                expect(event.Records[0].Sns.Message).to.equal(params.Message);
                done();
            });

            mocks.sns.publish(params, function(err, data) {
                if (err) return done(err);
            });

        });

    });

    /*describe('#lambda', function() {
        
        it('echo event', Promise.coroutine(function *() {
            const result = yield mocks.lambda('foo', 'bar', { a: { b: 5 } }, function(event, context, callback) {
                callback(null, event.Records[0].Sns.Message);
            });
            expect(JSON.parse(result)).to.deep.equal({ a: { b: 5 } });
        }));

        it('report error', function() {
            const promise = mocks.lambda('foo', 'bar', { a: { b: 5 } }, function(event, context, callback) {
                callback(Error('Error Message'));
            });
            return promise.catch(e => expect(e).to.be.instanceOf(Error));
        })
        
    });*/
    
});