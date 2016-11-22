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

// look for DEBUG parameter
const rx =/^DEBUG=([\s\S]+?)$/;
var match;
for (var i = 2; i < process.argv.length; i++) {
    match = rx.exec(process.argv[i]);
    if (match) process.env.DEBUG = match[1];
}

module.exports = {
    aggregator          : require('./bin2/aggregator'),
    events              : require('./bin2/event-interface'),
    lambda              : require('./bin2/lambda'),
    orchestrate         : require('./bin2/orchestrate'),
    response            : require('./bin2/response'),
    sns                 : require('./bin2/sns')
};


/*
const EventInterface    = require('./bin/event-interface');
const Log               = require('./bin/log');
const Mock              = require('./bin/mock');
const Scather           = require('./bin/scatter-gather');
const Server            = require('./bin/server');
const Subscription      = require('./bin/subscription');

module.exports = {
    aggregator: Scather.aggregator,
    events: {
        off: EventInterface.off,
        on: EventInterface.on,
        once: EventInterface.once
    },
    local: {
        subscribe: Subscription.subscribe,
        unsubscribe: Subscription.unsubscribe
    },
    logger: Log,
    mock: Mock,
    response: Scather.response,
    server: Server
};*/
