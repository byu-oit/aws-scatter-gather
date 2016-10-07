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
const EventInterface    = require('../bin/event-interface');
const Promise           = require('bluebird');
const Scather           = require('../index');

const aggregator        = Scather.aggregator;

Promise.onPossiblyUnhandledRejection(noop);

describe('Scather.aggregator', function() {
    var responseFn;

    before(function() {
        responseFn = Scather.response(function(data, attributes, callback) {
            callback(null, data);
        });
        Scather.local.subscribe('echo', 'my-echo', responseFn);
    });

    after(function() {
        Scather.local.unsubscribe('echo', responseFn);
    });



    it('returns a function', function() {
        const fn = aggregator({ topicArn: 'echo' });
        expect(fn).to.be.a('function');
        fn.unsubscribe();
    });

    it('subscribes to the topic arn', function(done) {
        EventInterface.once(EventInterface.SUBSCRIBE, function(e) {
            expect(e.functionName).to.equal('echo');
            done();
        });
        const fn = aggregator({ topicArn: 'echo', functionName: 'echo' });
        expect(fn).to.be.a('function');
        fn.unsubscribe();
    });

    it('callback paradigm returns nothing', function() {
        const fn = aggregator({ topicArn: 'echo', functionName: 'echo' });
        const returned = fn('foo', noop);
        fn.unsubscribe();
        expect(returned).to.equal(undefined);
    });

    it('promise paradigm returns a Promise', function() {
        const fn = aggregator({ topicArn: 'echo', functionName: 'echo' });
        const returned = fn('foo');
        fn.unsubscribe();
        expect(typeof returned).to.equal('object');
        expect(typeof returned.then).to.equal('function');
    });

    it('completes when received all expected results', function(done) {
        const fn = aggregator({ topicArn: 'echo', functionName: 'echo', expects: ['my-echo'], maxWait: 1500 });
        const start = Date.now();
        return fn('foo', function(err, value) {
            expect(value['my-echo']).to.equal('foo');
            expect(Date.now() - start).to.be.lessThan(1500);
            fn.unsubscribe();
            done();
        });
    });

    it('completes after minWait', function() {
        const start = Date.now();
        const fn = aggregator({ topicArn: 'echo', functionName: 'echo', expects: ['my-echo'], maxWait: 5000, minWait: 2000 });
        return fn('foo')
            .then(function() {
                expect(Date.now() - start).to.be.greaterThan(1999);
                fn.unsubscribe();
            });
    });

    it('completes by maxWait', function() {
        const start = Date.now();
        const fn = aggregator({ topicArn: 'echo', functionName: 'echo', expects: ['foobar'], maxWait: 1000 });
        return fn('foo')
            .then(function() {
                expect(Date.now() - start).to.be.lessThan(1100);
                fn.unsubscribe();
            });
    });

    it('ignores failed responses', function() {
        const res = Scather.response(function(data, attributes, callback) {
            throw Error('Fail');
        });
        Scather.local.subscribe('fail', 'myFail', res);

        const agg = aggregator({ topicArn: 'fail', functionName: 'echo', expects: ['foobar'], maxWait: 1000 });
        return agg('foo')
            .then(function(value) {
                expect(Object.keys(value).length).to.equal(0);
                agg.unsubscribe();
                Scather.local.unsubscribe('fail', res);
            });
    });

});

function noop() {}