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

exports.extractScatherRecords = function(event, filter) {
    const results = [];
    if (typeof filter !== 'function') filter = () => true;
    if (event.hasOwnProperty('Records')) {
        event.Records.forEach(function(record) {
            if (record.Sns) {
                const o = exports.decodeMessage(record.Sns);
                if (filter(o, record)) results.push(o);
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

exports.createNotificationEvent = function(topicArn, message, messageAttributes) {
    const o = preProcessEventMessage(message, messageAttributes);
    return {
        Records: [
            {
                EventVersion: "1.0",
                EventSubscriptionArn: '',
                EventSource: "awssg:local",
                Sns: {
                    SignatureVersion: '',
                    Timestamp: new Date().toISOString(),
                    Signature: '',
                    SigningCertUrl: '',
                    MessageId: uuid(),
                    Message: o.message,
                    MessageAttributes: o.messageAttributes,
                    Type: "Notification",
                    UnsubscribeUrl: '',
                    TopicArn: topicArn,
                    Subject: ''
                }
            }
        ]
    }
};

exports.createPublishEvent = function(topicArn, message, messageAttributes) {
    const o = preProcessEventMessage(message, messageAttributes);    
    return {
        Message: o.message,
        MessageAttributes: o.messageAttributes,
        TopicArn: topicArn
    };
};

exports.encodeAttributes = function(object) {
    const result = {};
    Object.keys(object).forEach(key => {
        const value = object[key];
        if (typeof value === 'number') {
            result[key] = {
                DataType: 'Number',
                StringValue: value.toString()
            }
        } else if (value instanceof Buffer) {
            result[key] = {
                DataType: 'Binary',
                StringValue: value.toString()
            }
        } else if (typeof value !== 'undefined') {
            result[key] = {
                DataType: 'String',
                StringValue: value.toString()
            }
        }
    });
    return result;
};

exports.decodeAttributes = function(attributes) {
    const result = {};
    Object.keys(attributes).forEach(key => {
        const item = attributes[key];
        switch (item.DataType) {
            case 'String':
                result[key] = item.StringValue;
                break;
            case 'Number':
                result[key] = /\./.test(item.StringValue) ? parseFloat(item.StringValue) : parseInt(item.StringValue);
                break;
            case 'Binary':
                result[key] = new Buffer(item.BinaryValue);
        }
    });
    return result;
};

exports.decodeMessage = function(snsBody) {
    const attributes = exports.decodeAttributes(snsBody.MessageAttributes);
    return {
        attributes: attributes,
        hash: attributes.ScatherHash,
        message: JSON.parse(snsBody.Message).Message
    }
};

function preProcessEventMessage(message, messageAttributes) {
    if (!messageAttributes) messageAttributes = {};
    messageAttributes = exports.encodeAttributes(messageAttributes);

    message = JSON.stringify({ Message: message });

    messageAttributes.ScatherHash = {
        DataType: 'String',
        StringValue: crypto.createHash('md5').update(message).digest("hex")
    };
    
    return {
        message: message,
        messageAttributes: messageAttributes
    }
}

function parseJson(json) {
    try {
        return JSON.parse(json);
    } catch (e) {
        return void 0;
    }
}