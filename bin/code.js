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

exports.encode = function(event) {
    return 'AWSSG:' + JSON.stringify(event);
};

exports.decode = function(str) {
    if (str.indexOf('AWSSG:') !== 0) return null;
    try {
        return JSON.parse(str.substr(6));
    } catch (e) {
        return null;
    }
};

/*
exports.publish = function(sns, event) {
    return new Promise(function(resolve, reject) {
        const params = {
            Message: exports.encode(event),
            TopicArn: event.topicArn
        };
        sns.publish(params, function (err) {
            if (err) {
                debug('Failed to publish event ' + event.requestId + ' to ' + event.topicArn + ': ' + err.message, event);
                reject(err);

            } else {
                debug('Published event ' + event.requestId + ' to ' + event.topicArn, event);
                resolve();
            }
        });
    })
};*/
