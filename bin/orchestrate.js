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
const debug                 = require('./debug')('orchestrate', 'cyan');
const EventInterface        = require('./event-interface');
const fork                  = require('child_process').fork;

const children = [];
var offset = 1;

// if this process is a child then listen for inter-process events to put on the local event interface
if (process.send) {
    process.on('message', function(event) {
        debug('P2C received ' + event.requestId + ' for request:' + event.topicArn);
        EventInterface.emit('request', event.topicArn, event);
    });

    EventInterface.on('response', function (event) {
        process.send(event);
        debug('P2C sent ' + event.requestId + ' to response:' + event.topicArn);
    });

    // tell the parent process that the child is running and ready to receive messages
    setTimeout(function() {
        process.send('ready');
    }, 0);
}



module.exports = Orchestrate;

function Orchestrate(modulePath) {
    const debugInfo = getDebugInfo();
    return new Promise(function(resolve, reject) {
        run(modulePath, debugInfo, resolve, reject);
    });
}

Orchestrate.end = function() {
    while (children.length) {
        const child = children.shift();
        debug('Ending child process ' + child.pid);
        child.kill();
    }
};



function getDebugInfo() {
    const rx = /^--debug(-brk)?=(\d+)$/;
    var match;
    for (var i = 0; i < process.execArgv.length; i++) {
        match = rx.exec(process.execArgv[i]);
        if (match) return {
            name: '--debug' + match[1],
            value: parseInt(match[2])
        };
    }
}

function run(modulePath, debugInfo, resolve, reject) {
    const args = debugInfo ? [ debugInfo.name + '=' + (debugInfo.value + offset++) ] : [];
    const child = fork(modulePath, process.argv.slice(2), { execArgv: args });
    var pending = true;

    // when the child sends a message, fire it as a response on the event interface
    child.on('message', function (event) {
        if (event === 'ready' && pending) {
            EventInterface.on('request', function (event) {
                child.send(event);
                debug('P2C sent ' + event.requestId + ' to request:' + event.topicArn + ' on ' + child.pid);
            });

            pending = false;
            resolve(child);
        } else {
            debug('C2P received ' + event.requestId + ' for response:' + event.topicArn + ' from ' + child.pid);
            EventInterface.emit('response', event.topicArn, event);
        }
    });

    children.push(child);
}