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
const Promise           = require('bluebird');
const Request           = require('request');
const uuid              = require('uuid');

const subscriptions = {};
const unconfirmed = {};

/**
 * Call the specified callback function as if it were called by a lambda.
 * @param {string} lambdaName
 * @param {string} topicArnName
 * @param {*} event
 * @param {function} callback
 * @returns {Promise}
 */
exports.lambda = function(name, topicArn, fnLambda) {
    const context = {
        callbackWaitsForEmptyEventLoop: true,
        logGroupName: "/aws/lambda/" + name,
        logStreamName: "2016/06/15/[$LATEST]88b14483c48b4400b49c5a44dd36214b",
        functionName: name,
        memoryLimitInMB: "128",
        functionVersion: "$LATEST",
        invokeid: "726e8ca9-334b-11b6-be50-532ed11e25c5",
        awsRequestId: "726e8ca9-334b-11a6-bc50-532ed11c25a5",
        invokedFunctionArn: "arn:aws:lambda:us-west-2:016948893071:function:" + name
    };

    addSubscription(topicArn, function(event) {
        fnLambda(event, Object.assign({}, context), function(err, data) {
            return;
        });
    });
};

exports.reset = function() {
    Object.keys(subscriptions).forEach(k => delete subscriptions[k]);
    Object.keys(unconfirmed).forEach(k => delete unconfirmed[k]);
};

exports.sns = {

    confirmSubscription: function(params, callback) {
        if (unconfirmed[params.Token].TopicArn === params.TopicArn) {
            const subscription = unconfirmed[params.Token];
            delete unconfirmed[params.Token];
            addSubscription(params.TopicArn, subscription);
            callback(null, {});
        } else {
            callback(Error('Invalid confirmation token or topic arn.'));
        }
    },

    publish: function(params, callback) {
        const event = {
            Records: [
                {
                    EventVersion: "1.0",
                    EventSubscriptionArn: params.TopicArn,
                    EventSource: "aws:sns",
                    Sns: {
                        SignatureVersion: "1",
                        Timestamp: new Date().toISOString(),
                        Signature: "EXAMPLE",
                        MessageId: uuid(),
                        Message: params.Message,
                        Type: "Notification",
                        TopicArn: params.TopicArn,
                        Subject: "Subject"
                    }
                }
            ]
        };
        
        if (subscriptions.hasOwnProperty(params.TopicArn)) {
            subscriptions[params.TopicArn].forEach(callback => {
                callback(event);
            });
        }
    },

    subscribe: function(params, callback) {
        const token = uuid();
        const config = {
            method: 'POST',
            url: params.Endpoint,
            headers: {
                'x-amz-sns-message-type': 'SubscriptionConfirmation'
            },
            body: {
                Type: "SubscriptionConfirmation",
                MessageId: "812bbfc7-ba77-4f31-96f2-d9938eef453f",
                Token: token,
                TopicArn: params.TopicArn,
                Message: "You have chosen to subscribe to the topic " + params.TopicArn + ".\nTo confirm the subscription, visit the SubscribeURL included in this message.",
                Timestamp: new Date().toISOString()
            },
            json: true
        };

        // define the function to send notification when an event occurs
        unconfirmed[token] = function(event) {
            const config = {
                method: 'POST',
                url: params.Endpoint,
                headers: {
                    'x-amz-sns-message-type': 'Notification'
                },
                body: {
                    Type: "Notification",
                    MessageId: uuid(),
                    Token: uuid(),
                    TopicArn: params.topicArn,
                    Message: event.Records[0].Sns.Message,
                    Timestamp: new Date().toISOString()
                },
                json: true
            };
            Request(config, function(err, response, body) {
                return;
            });
        };
        unconfirmed[token].TopicArn = params.TopicArn;

        Request(config, function(err, response, body) {
            if (err) return callback(err);
            callback(null, body);
        });
    }

};


function addSubscription(topicArn, callback) {
    if (!subscriptions.hasOwnProperty(topicArn)) subscriptions[topicArn] = [];
    subscriptions[topicArn].push(callback);
}