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
// TODO: only set up one tunnel for multiple subscriptions
// TODO: upload a lambda for testing

'use strict';
const EventInterface    = require('./bin/event-interface');
const Log               = require('./bin/log');
const Scather           = require('./bin/scatter-gather');
const Server            = require('./bin/server');
const Subscription      = require('./bin/subscription');

module.exports = {
    EventInterface: EventInterface,
    Logger: Log,
    request: Scather.request,
    response: Scather.response,
    server: Server,
    subscribe: Subscription.subscribe,
    unsubscribe: Subscription.unsubscribe
};