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
const crypto            = require('crypto');
const uuid              = require('uuid').v4;

const rxTopicArn = /^arn:aws:sns:[\s\S]+?:\d+:[\s\S]+?$/;


exports.extractScatherRecords = function(event, filter) {
    const results = [];
    if (typeof filter !== 'function') filter = function() { return true; }
    if (event.hasOwnProperty('Records')) {
        event.Records.forEach(function(record) {
            if (record.Sns) {
                const o = exports.decodeMessage(record.Sns.Message);
                if (o && filter(o, record)) results.push(o);
            }
        });
    }
    return results;
};

exports.getResponseParameters = function(err, data, name, responseId, topicArn) {
    const message = {
        error: err,
        data: err ? null : data
    };
    
    const messageAttributes = {
        ScatherResponseName: {
            DataType: 'String',
            StringValue: name
        },
        ScatherResponseId: {
            DataType: 'String',
            StringValue: responseId
        }
    };

    return exports.createPublishEvent(topicArn, message, messageAttributes);
};

exports.isValidAwsTopicArn = function(topicArn) {
    return rxTopicArn.test(topicArn);
};

exports.createNotificationEvent = function(topicArn, message, messageAttributes) {
    return {
        Type: 'Notification',
        MessageId: uuid(),
        TopicArn: topicArn,
        Message: preProcessEventMessage(message, messageAttributes),
        MessageAttributes: {},
        Timestamp: new Date().toISOString(),
        SignatureVersion: '',
        Signature: '',
        SigningCertURL: '',
        UnsubscribeURL: ''
    };
};

exports.createRecordEventFromNotifcation = function(event) {
    if (!event || event.Type !== 'Notification') throw Error('Cannot create record event from invalid notification event.');
    return {
        Records: [
            {
                EventVersion: "1.0",
                EventSubscriptionArn: '',
                EventSource: "awssg:local",
                Sns: {
                    SignatureVersion: event.SignatureVersion,
                    Timestamp: event.Timestamp,
                    Signature: event.Signature,
                    SigningCertUrl: event.SigningCertURL,
                    MessageId: event.MessageId,
                    Message: event.Message,
                    MessageAttributes: event.MessageAttributes,
                    Type: "Notification",
                    UnsubscribeUrl: event.UnsubscribeURL,
                    TopicArn: event.TopicArn,
                    Subject: ''
                }
            }
        ]
    }
};

exports.createPublishEvent = function(topicArn, message, messageAttributes) {
    return {
        Message: preProcessEventMessage(message, messageAttributes),
        TopicArn: topicArn
    };
};

exports.decodeMessage = function(message) {
    if (message.substr(0, 6) === 'AWSSG:') {
        message = message.substr(6);
        return parseJson(message);
    }
};

function preProcessEventMessage(message, messageAttributes) {
    const messageStr = typeof message === 'object' ? JSON.stringify(message) : message.toString();
    const hash = crypto.createHash('md5').update(messageStr).digest("hex")
    return 'AWSSG:' + JSON.stringify({
        attributes: messageAttributes || {},
        hash: hash,
        message: message
    });
}

function parseJson(json) {
    try {
        return JSON.parse(json);
    } catch (e) {
        return void 0;
    }
}