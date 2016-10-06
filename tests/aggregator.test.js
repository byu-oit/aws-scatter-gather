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
const mock              = Scather.mock;

Promise.onPossiblyUnhandledRejection(noop);

describe('Scather.aggregator', function() {

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

    describe('callback paradigm', function() {

        it('returns nothing', function() {
            const fn = aggregator({ topicArn: 'echo', functionName: 'echo' });
            const returned = fn('foo', noop);
            fn.unsubscribe();
            expect(returned).to.equal(undefined);
        });

    });

});

function noop() {}