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
const AWS               = require('aws-sdk');
const EventInterface    = require('./event-interface');
const EventRecord       = require('./event-record');
const Log               = require('./log')('ORCHESTRATE');

const rxArn = /^arn:aws:sns:[\s\S]+?:\d+:[\s\S]+?$/;
const orchestrations = {};

/**
 * Turn on orchestration for the specified topic and handler.
 * @param {string} topicArn
 * @param {string} functionName
 * @param {function} handler
 */
exports.on = function(topicArn, functionName, handler) {
    if (typeof handler !== 'function') throw Error('Can only orchestrate with functions. Received: ' + handler);
    if (!orchestrations.hasOwnProperty(topicArn)) orchestrations[topicArn] = [];
    const index = findIndex(topicArn, handler);
    if (index === -1) orchestrations[topicArn].push({ functionName: functionName, handler: handler });
    Log.info('Enabled ' + (functionName || '<anonymous>') + ' for topic ' + topicArn);
};

/**
 * Turn off orchestration for the specified topic and handler.
 * @param {string} topicArn
 * @param {function} handler
 */
exports.off = function(topicArn, handler) {
    if (orchestrations.hasOwnProperty(topicArn)) {
        const index = findIndex(topicArn, handler);
        const item = orchestrations[topicArn][index] || {};
        if (index === -1) orchestrations[topicArn].splice(index, 1);
        if (!orchestrations[topicArn].length) delete orchestrations[topicArn];
        Log.info('Disabled ' + (item.functionName || '<anonymous>') + ' for topic ' + topicArn);
    }
};

// take each publish event and repackage it as a notification
EventInterface.on(EventInterface.PUBLISH, function(params) {

    // if the aws object has credentials then publish the event to the SNS Topic
    if (AWS.config.credentials && rxArn.test(params.TopicArn)) {
        const sns = new AWS.SNS();
        sns.publish(params, function(err, data) {
            EventInterface.fire(EventInterface.SNS, {
                action: 'publish',
                error: err,
                params: params,
                result: data 
            });
        });
    }

    // create a local notification event
    const data = EventRecord.decodeMessage(params);
    const event = EventRecord.createNotificationEvent(params.TopicArn, data.message, data.attributes);
    EventInterface.fire(EventInterface.NOTIFICATION, event);
});

// take each notification event and run orchestrations
EventInterface.on(EventInterface.NOTIFICATION, function(snsEvent) {
    const records = {};
    if (snsEvent && snsEvent.Records) {

        // split records based on topic arn
        snsEvent.Records.forEach(function(record) {
            if (record.Sns && record.Sns.TopicArn) {
                const topicArn = record.Sns.TopicArn;
                if (!records.hasOwnProperty(topicArn)) records[topicArn] = [];
                records[topicArn].push(record);
            }
        });

        const original = JSON.stringify(snsEvent);

        Object.keys(records).forEach(function(topicArn) {
            if (orchestrations.hasOwnProperty(topicArn)) {
                const copy = JSON.parse(original);
                copy.Records = records[topicArn];
                orchestrations[topicArn].forEach(item => {
                    item.handler(copy, { functionName: item.functionName }, noop);
                });
            }
        });
    }
});

function findIndex(topicArn, handler) {
    if (!orchestrations.hasOwnProperty(topicArn)) return -1;
    for (var i = 0; i < orchestrations[topicArn].length; i++) {
        if (orchestrations[topicArn][i].handler === handler) return i;
    }
    return -1;
}

function noop() {}