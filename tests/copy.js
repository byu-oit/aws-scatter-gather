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
const copy          = require('../bin/copy');
const expect        = require('chai').expect;

describe('copy', () => {

    describe('array', () => {

        it('empty array', () => {
            let a = [];
            let c = copy(a);
            expect(a).to.deep.equal(c);
        });

        describe('primitives array', () => {
            let a;
            let c;

            before(() => {
                a = [1, 'a', true];
                c = copy(a);
            });

            it('deep equal', () => {
                expect(a).to.deep.equal(c);
            });

            it('not equal', () => {
                expect(a).to.not.equal(c);
            });

            it('has 1 at index 0', () => {
                expect(c[0]).to.equal(1);
            });

            it('has "a" at index 1', () => {
                expect(c[1]).to.equal('a');
            });

            it('has true at index 2', () => {
                expect(c[2]).to.equal(true);
            });

            it('not frozen by default', () => {
                expect(Object.isFrozen(c)).to.equal(false);
            });

            it('can freeze', () => {
                let c2 = copy(a, true);
                expect(Object.isFrozen(c2)).to.equal(true);
            });

        });

        describe('complex array', () => {
            let a;
            let c;
            let da;
            let ea;
            let oc;
            let oba;
            let ob;
            let oa;
            let pa;

            before(() => {
                ea = [];
                da = [ea];
                oc = { c: true };
                oba = [ oc ];
                ob = { b: oba };
                oa = { a: ob };
                pa = [1, 'a', true];

                a = [pa, da, oa];
                c = copy(a);
            });

            it('deep equal', () => {
                expect(a).to.deep.equal(c);
            });

            it('not equal', () => {
                expect(a).to.not.equal(c);
            });

            describe('has [1, "a", true] at index 0', () => {

                it('not equal', () => {
                    expect(c[0]).to.not.equal(pa);
                });

                it('has 1 at index 0', () => {
                    expect(c[0][0]).to.equal(1);
                });

                it('has "a" at index 1', () => {
                    expect(c[0][1]).to.equal('a');
                });

                it('has true at index 2', () => {
                    expect(c[0][2]).to.equal(true);
                });

            });

            describe('has [[]] at index 1', () => {

                it('not equal', () => {
                    expect(c[1]).to.not.equal(ea);
                });

                it('has [] at index 0', () => {
                    expect(c[1][0]).to.deep.equal(ea);
                });

            });

            describe('has {a:{b:[{c:true}]}} at index 2', () => {

                it('not equal', () => {
                    expect(c[2]).to.not.equal(oa);
                });

            });

            it('not frozen by default', () => {
                expect(Object.isFrozen(c)).to.equal(false);
            });

            it('can freeze', () => {
                let c2 = copy(a, true);
                expect(Object.isFrozen(c2)).to.equal(true);
                expect(Object.isFrozen(c2[0])).to.equal(true);
                expect(Object.isFrozen(c2[1])).to.equal(true);
                expect(Object.isFrozen(c2[2])).to.equal(true);
            });

        });

    });

    describe('not-plain object', () => {
        function Animal(type) {
            this.type = type;
        }

        it('is the same reference', () => {
            let o = new Animal('dog');
            let c = copy(o);
            expect(o).to.equal(c);
        });

        it('does not lock', () => {
            let o = new Animal('dog');
            let c = copy(o, true);
            expect(Object.isFrozen(c)).to.equal(false);
        });

    });

    describe('plain object', () => {
        let o;
        let c;

        before(() => {
            o = { a: { b: true }};
            c = copy(o);
        });

        it('deep copy', () => {
            expect(c).to.deep.equal(o);
        });

        it('not equal', () => {
            expect(c).to.not.equal(o);
        });

    });

    describe('primitives', () => {

        it('boolean', () => {
            let b = true;
            let c = copy(b);
            expect(b).to.equal(c);
        });

        it('integer', () => {
            let i = 5;
            let c = copy(i);
            expect(i).to.equal(c);
        });

        it('string', () => {
            let s = 'string';
            let c = copy(s);
            expect(s).to.equal(c);
        });

    });
});