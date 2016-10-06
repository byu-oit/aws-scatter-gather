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
const Log               = require('./log')('SERVER');
const Promise           = require('bluebird');
const schemas           = require('./schemas');

const confirmedSubscriptions = {};
const unconfirmedSubscriptions = {};

module.exports = {
    middleware: middleware,
    subscribe: subscribe,
    unsubscribe: unsubscribe
};

/**
 * Confirm a subscription.
 * @param body
 * @returns {*}
 */
function confirmSubscription(body) {

    // check to see if we're waiting on this topic confirmation
    const topicArn = body.TopicArn;
    if (!unconfirmedSubscriptions.hasOwnProperty(body.TopicArn)) return;

    // build the sns object
    const sns = new AWS.SNS();

    // get deferred object
    const deferred = unconfirmedSubscriptions[topicArn];

    // send aws the confirmation
    const params = {
        Token: body.Token,
        TopicArn: topicArn
    };
    sns.confirmSubscription(params, function (err, data) {
        EventInterface.fire(EventInterface.SNS, {
            action: 'confirmSubscription',
            error: err,
            params: params,
            result: data
        });

        // delete from unconfirmed subscriptions despite outcome
        delete unconfirmedSubscriptions[topicArn];

        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(data.SubscriptionArn);
            Log.info('Subscribed to AWS SNS Topic: ' + deferred.topicArn);

            // store confirmed subscription arn
            confirmedSubscriptions[topicArn] = data.SubscriptionArn;
        }
    });

}

/**
 * Get a middleware function that will pick up and handle aws post requests
 * @param {Object} configuration
 * @returns {Function}
 */
function middleware(configuration) {
    const config = schemas.middleware.normalize(configuration || {});

    return function(req, res, next) {

        // if this is not a message from aws then continue to next middleware
        if (req.method !== 'POST' || !req.headers['x-amz-sns-message-type']) return next();

        // process aws message
        parseBody(req, function(err, body) {
            if (err) return next(err);

            req.body = body;
            switch (req.headers['x-amz-sns-message-type']) {
                case 'Notification':
                    EventInterface.fire(EventInterface.NOTIFICATION, body);
                    break;
                case 'SubscriptionConfirmation':
                    confirmSubscription(body);
                    break;
                case 'UnsubscribeConfirmation':
                    break;
            }

            if (!config.passThrough) res.end();
        });
    };
}

/**
 * Parse the response body.
 * @param {Object} req
 * @param {function} callback
 */
function parseBody(req, callback) {
    var body = '';

    req.on('error', function(err) {
        if (callback) callback(err, null);
        callback = null;
    });

    req.on('data', function(chunk) {
        body += chunk.toString();
    });

    req.on('end', function() {
        var err = null;
        var obj = null;
        try {
            obj = JSON.parse(body);
        } catch (err) {
            err = Error('Unexpected body format received. Expected application/json, received: ' + body);
        }
        if (callback) callback(null, obj);
        callback = null;
    });
}

/**
 * Subscribe to an SNS Topic.
 * @param {string} topicArn
 * @param {string} endpoint
 * @returns {Promise}
 */
function subscribe(topicArn, endpoint) {

    // validate the topic arn
    if (!EventRecord.isValidAwsTopicArn(topicArn)) {
        Log.warn('Cannot subscribe to an invalid AWS Topic Arn: ' + topicArn);
        return Promise.resolve();
    }

    // build the sns object
    const sns = new AWS.SNS();

    // if already subscribed then return now
    const subscriptionArn = confirmedSubscriptions[topicArn];
    if (subscriptionArn) return Promise.resolve(subscriptionArn);

    // if subscription request underway then return previous promise
    if (unconfirmedSubscriptions[topicArn]) return unconfirmedSubscriptions[topicArn].promise;

    const deferred = defer();
    deferred.topicArn = topicArn;
    const params = {
        Protocol: /^(https?):/.exec(endpoint)[1],
        TopicArn: topicArn,
        Endpoint: endpoint
    };
    sns.subscribe(params, function(err, data) {
        EventInterface.fire(EventInterface.SNS, {
            action: 'subscribe',
            error: err,
            params: params,
            result: data
        });
        if (err) return deferred.reject(err);
    });
    unconfirmedSubscriptions[topicArn] = deferred;

    return deferred.promise;
}

/**
 * Unsubscribe the server from aws.
 * @param {string} topicArn
 * @returns {Promise}
 */
function unsubscribe(topicArn) {
    const subscriptionArn = confirmedSubscriptions[topicArn];
    delete unconfirmedSubscriptions[topicArn];
    if (!subscriptionArn) return Promise.resolve();

    // build the sns object
    const sns = new AWS.SNS();

    return new Promise(function(resolve, reject) {
        const params = {
            SubscriptionArn: subscriptionArn
        };
        sns.unsubscribe(params, function (err) {
            EventInterface.fire(EventInterface.SNS, {
                action: 'unsubscribe',
                error: err,
                params: params,
                result: data
            });
            if (err) return reject(err);
            resolve();
        });
    });
}