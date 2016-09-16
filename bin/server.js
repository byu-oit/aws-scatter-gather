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
const bodyParser        = require('body-parser');
const defer             = require('./defer');
const express           = require('express');
const EventInterface    = require('./event-interface');
const Graceful          = require('node-graceful');
const Log               = require('./log')('SERVER');
const ngrok             = require('ngrok');
const Promise           = require('bluebird');
const schemas           = require('./schemas');
const Subscriptions     = require('./subscription');

const confirmedSubscriptions = {};
const coStart = Promise.coroutine(start);
const coStop = Promise.coroutine(stop);
const unconfirmedSubscriptions = {};
var runConfig;
var runSns;
var startPromise;
var stopPromise;
var stopper;

module.exports = exports = {

    start: paradigm(configuration => {
        const state = getState();
        if (state === 'starting' || state === 'started') return Promise.reject(Error('The server is already ' + state));
        if (state === 'ending') return stopPromise.then(() => exports.start());

        const config = schemas.server.normalize(configuration);
        if (!config.tunnel && !config.endpoint) return Promise.reject(Error('Either the endpoint must be specified or the tunnel must be enabled.'));
        runConfig = config;

        startPromise = coStart(config);
        startPromise.catch(e => startPromise = null);
        return startPromise;
    }),

    ready: paradigm(getReadyPromise),

    get state () { return getState(); },

    stop: paradigm(() => {
        const state = getState();
        if (state === 'stopping' || state === 'stopped') return Promise.reject(Error('The server is already ' + state));
        if (state === 'starting') return startPromise.then(() => exports.end());

        stopPromise = coStop();
        stopPromise.finally(() => {
            startPromise = null;
            stopPromise = null;
        });
        return stopPromise;
    }),

    subscribe: function(topicArn) {
        return runSns ?
            awsSubscribe(runSns, topicArn, runConfig.endpoint) :
            Promise.resolve('');
    },

    unsubscribe: awsUnsubscribe
};

Graceful.on('exit', coStop);



/**
 * Get a promise
 * @returns {Promise}
 */
function getReadyPromise() {
    const promises = [];
    Object.keys(unconfirmedSubscriptions).forEach(k => {
        promises.push(unconfirmedSubscriptions[k].promise);
    });
    return Promise.all(promises);
}

/**
 * Get the state based on known promise states.
 * @returns {string}
 */
function getState() {
    if (!startPromise) return 'stopped';
    if (startPromise.isPending()) return 'starting';
    if (stopPromise && stopPromise.isPending()) return 'stopping';
    return 'started';
}

/**
 * Return a function that handles either the callback or promise paradigm.
 * @param {function} fn
 * @returns {function}
 */
function paradigm(fn) {
    return function() {
        const lastArg = arguments.length > 0 ? arguments[arguments.length - 1] : null;
        const promise = fn.apply(exports, arguments);
        if (typeof lastArg === 'function') {
            promise.then(v => callback(null, v), e => callback(e, null));
        } else {
            return promise;
        }
    }
}

/**
 * Start the server.
 * @param config
 * @returns {*}
 */
function * start(config) {

    try {
        // initialize the stopper instructions
        stopper = [];

        // start the express app and add middleware
        const app = express();
        const sns = new AWS.SNS();
        runSns = sns;
        app.use(awsContentType);
        app.use(bodyParser.json());
        app.use(awsConfirmSubscription(sns));
        app.use(awsNotification());

        // wait for the server to listen on a port
        const server = yield serverListen(app, config.port);
        stopper.push({ args: [], aysnc: false, callback: server.close, context: server, message: 'Server connection closed' });
        Log.info('Server listening on port ' + server.address().port);

        // start ngrock if enabled
        if (config.tunnel) {
            let tunnel = typeof config.tunnel === 'object' ? Object.assign({}, config.tunnel) : {};
            tunnel.addr = server.address().port;
            config.endpoint = yield connectNgrok(tunnel);
            stopper.push({ args: [config.endpoint], aysnc: false, callback: ngrok.disconnect, context: ngrok, message: 'Ngrok tunnel disconnected' });
            Log.info('Ngrok tunnel enabled: ' + config.endpoint);
        }

        Subscriptions.list(true).forEach(function(topicArn) {
            awsSubscribe(sns, topicArn, config.endpoint);
        });

        return getReadyPromise();

    } catch (e) {
        Log.info('Failed to start: ' + err.stack);
        return coStop().then(() => { throw err });
    }
}

function * stop() {
    var item;
    while (item = stopper.pop()) {
        try {
            if (!item.async) {
                item.callback.apply(item.context || item.callback, item.args);
            } else {
                yield item.callback.apply(item.context || item.callback, item.args);
            }
            Log.info(item.message);
        } catch (err) {
            Log.info('Failed to stop: ' + err.stack);
            return Promise.reject(err);
        }
    }
    ngrok.kill();
}

/**
 * Middleware that forces aws messages to have the content type header set to application/json
 * @param req
 * @param res
 * @param next
 */
function awsContentType(req, res, next) {
    switch (req.headers['x-amz-sns-message-type']) {
        case 'Notification':
        case 'SubscriptionConfirmation':
        case 'UnsubscribeConfirmation':
            req.headers['content-type'] = 'application/json';
            break;
    }
    next();
}

/**
 * Create middleware for responding to AWS confirmation requests. Also get a promise that resolves once confirmed.
 * @param sns
 * @returns {{middleware: middleware, promise: Promise}}
 */
function awsConfirmSubscription(sns) {
    return function(req, res, next) {
        if (req.method !== 'POST' || req.headers['x-amz-sns-message-type'] !== 'SubscriptionConfirmation') return next();

        // check to see if we're waiting on this topic confirmation
        const topicArn = req.body.TopicArn;
        if (!unconfirmedSubscriptions.hasOwnProperty(req.body.TopicArn)) return res.end();

        // get deferred object
        const deferred = unconfirmedSubscriptions[topicArn];

        // send aws the confirmation
        const params = {
            Token: req.body.Token,
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
                Log.info('Local server subscribed to SNS Topic');

                // store confirmed subscription arn
                confirmedSubscriptions[topicArn] = data.SubscriptionArn;
            }
        });

        // send an empty response
        res.end();
    };
}

/**
 * Middleware that puts aws notifications on the local event interface
 * @returns {Function}
 */
function awsNotification() {
    return function(req, res, next) {
        if (req.method !== 'POST' || req.headers['x-amz-sns-message-type'] !== 'Notification') return next();
        EventInterface.fire(EventInterface.NOTIFICATION, req.body);
        res.end();
    }
}

/**
 * Subscribe to an SNS Topic.
 * @param sns
 * @param topicArn
 * @param endpoint
 * @returns {Promise}
 */
function awsSubscribe(sns, topicArn, endpoint) {
    // if already subscribed then return now
    const subscriptionArn = confirmedSubscriptions[topicArn];
    if (subscriptionArn) return Promise.resolve(subscriptionArn);

    const deferred = defer();
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
}

/**
 * Unsubscribe the server from aws.
 * @param sns
 * @param topicArn
 * @returns {Promise}
 */
function awsUnsubscribe(sns, topicArn) {
    const subscriptionArn = confirmedSubscriptions[topicArn];
    delete unconfirmedSubscriptions[topicArn];
    if (!subscriptionArn) return Promise.resolve();

    const deferred = defer();
    const params = {SubscriptionArn: subscriptionArn};
    sns.unsubscribe(params, function (err) {
        if (err) return deferred.reject(err);
        deferred.resolve();
    });
    return deferred.promise;
}

/**
 * Start ngrok tunneling.
 * @param config
 * @returns {Promise}
 */
function connectNgrok(config) {
    const deferred = defer();
    ngrok.connect(config, function(err, url) {
        if (err) return deferred.reject(err);
        deferred.resolve(url);
    });
    return deferred.promise;
}

/**
 * Start the server listening on the specified port.
 * @param app
 * @param port
 * @returns {Promise}
 */
function serverListen(app, port) {
    const deferred = defer();
    const server = app.listen(port, function(err) {
        if (err) return deferred.reject(err);
        deferred.resolve(server);
    });
    return deferred.promise;
}





