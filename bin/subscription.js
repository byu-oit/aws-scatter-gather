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
const defer             = require('./defer');
const EventInterface    = require('./event-interface');
const EventRecord       = require('./event-record');
const Log               = require('./log')('SUBSCRIPTION');
const Server            = require('./server');

module.exports = {
    subscribe: subscribe,
    unsubscribe: unsubscribe
};

// handle events
EventInterface.on(EventInterface.PUBLISH, onPublish);
EventInterface.on(EventInterface.NOTIFICATION, onNotification);



//////////////////////////////////
//      PRIVATE FUNCTIONS       //
//////////////////////////////////

const rxArn = /^arn:aws:sns:[\s\S]+?:\d+:[\s\S]+?$/;
const subscriptions = {};

function findIndex(topicArn, handler) {
    if (!subscriptions.hasOwnProperty(topicArn)) return -1;
    for (var i = 0; i < subscriptions[topicArn].length; i++) {
        if (subscriptions[topicArn][i].handler === handler) return i;
    }
    return -1;
}

function onNotification(snsEvent) {
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
            if (subscriptions.hasOwnProperty(topicArn)) {
                const copy = JSON.parse(original);
                copy.Records = records[topicArn];
                subscriptions[topicArn].forEach(item => {
                    item.handler(copy, { functionName: item.functionName }, noop);
                });
            }
        });
    }
}

function onPublish(params) {

    // if the aws object has credentials and the topic arn looks valid then publish the event to the SNS Topic
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

    // take each publish event and repackage it as a notification
    const data = EventRecord.decodeMessage(params);
    const event = EventRecord.createNotificationEvent(params.TopicArn, data.message, data.attributes);
    EventInterface.fire(EventInterface.NOTIFICATION, event);
}

/**
 * Subscribe a handler to the specified topic.
 * @param {string} topicArn
 * @param {string} functionName
 * @param {function} handler
 * @param {function} [callback]
 * @returns {Promise|undefined}
 */
function subscribe(topicArn, functionName, handler, callback) {
    if (typeof handler !== 'function') return Promise.reject(Error('Can only subscribe with functions. Received: ' + handler));
    if (!subscriptions.hasOwnProperty(topicArn)) subscriptions[topicArn] = [];

    const index = findIndex(topicArn, handler);
    if (index === -1) {
        subscriptions[topicArn].push({ functionName: functionName, handler: handler });
        Log.info('Enabled ' + (functionName || '<anonymous>') + ' for topic ' + topicArn);
        EventInterface.fire(EventInterface.SUBSCRIBE, {
            functionName: functionName,
            handler: handler,
            topicArn: topicArn
        });
    } else {
        Log.info('Already enabled ' + (functionName || '<anonymous>') + ' for topic ' + topicArn);
    }

    // create a server subscription
    return defer.paradigm(Server.subscribe(topicArn).then(() => undefined), callback);
}

/**
 * Unsubscribe a handler from the topic
 * @param {string} topicArn
 * @param {function} handler
 * @param {function} [callback]
 */
function unsubscribe(topicArn, handler, callback) {
    if (subscriptions.hasOwnProperty(topicArn)) {
        const index = findIndex(topicArn, handler);
        const item = subscriptions[topicArn][index] || null;
        if (item) {
            subscriptions[topicArn].splice(index, 1);
            if (!subscriptions[topicArn].length) delete subscriptions[topicArn];
            Log.info('Disabled ' + (item.functionName || '<anonymous>') + ' for topic ' + topicArn);
            EventInterface.fire(EventInterface.UNSUBSCRIBE, {
                functionName: item.functionName,
                handler: handler,
                topicArn: topicArn
            });
        } else {
            Log.info('Already disabled for topic ' + topicArn);
        }
    } else {
        Log.info('Already disabled for topic ' + topicArn);
    }

    // if someone else still has a subscription to this topic then return, otherwise unsubscribe the server too
    if (subscriptions.hasOwnProperty(topicArn)) return defer.paradigm(Promise.resolve(), callback);
    return defer.paradigm(Server.unsubscribe(topicArn), callback);
}

function noop() {}