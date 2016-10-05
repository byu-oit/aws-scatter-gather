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
const Scather           = require('../index');

const mock              = Scather.mock;
const response          = Scather.response;

describe('Scather.response', function() {
    
    it('is a function', function() {
        expect(response).to.be.a('function');
    });

    it('throw an error if the first parameter is not a function', function() {
        expect(function() { response(); }).to.throw(Error);
    });
    
    it('returns a function', function() {
        expect(response(noop)).to.be.a('function');
    });
    
    describe('returned function', function() {
        
        describe('callback paradigm', function() {
            const fn = response(function(message, attributes, callback) {
                callback(null, message);
            });
            
            it('returns nothing', function() {
                const e = mock.snsEvent('echoArn', 'Hello');
                const result = fn(e, { functionName: 'echo' }, noop);
                expect(result).to.equal(undefined);
            });

            it('gets response through callback', function() {
                const e = mock.snsEvent('echoArn', 'Hello');
                fn(e, { functionName: 'echo' }, function(err, data) {
                    expect(err).to.equal(null);
                    expect(data).to.equal('Hello');
                });
            });
            
        });
        
        describe('promise paradigm', function() {
            
        });
        
        
    });
    
});

function noop() {}