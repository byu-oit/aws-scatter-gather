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
console.log('debug mode: ' + process.env.DEBUG);

module.exports = {
    aggregator          : require('./bin/aggregator'),
    events              : require('./bin/event-interface'),
    lambda              : require('./bin/lambda'),
    orchestrate         : require('./bin/orchestrate'),
    response            : require('./bin/response'),
    sns                 : require('./bin/sns')
};