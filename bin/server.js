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
const bodyParser    = require('body-parser');
const express       = require('express');

/**
 * Start a new server.
 * @param {object} sns The AWS Sns instance.
 * @param {object} config The server configuration.
 * @param {object} logger The logger to use
 * @param {function} callback A function to call with each request object.
 * @returns {Promise<Server>}
 */
module.exports = function(sns, config, logger, callback) {
    const protocol = /^(https?):/.exec(config.endpoint)[1];

    return new Promise(function(resolve, reject) {
        
        // get an express server instance
        const app = express();

        // If the message is from AWS then set the content type to application/json
        // before the body parser middleware
        app.use(function(req, res, next) {
            switch (req.headers['x-amz-sns-message-type']) {
                case 'Notification':
                case 'SubscriptionConfirmation':
                case 'UnsubscribeConfirmation':
                    req.headers['content-type'] = 'application/json';
                    break;
            }
            next();
        });

        // parse JSON body
        app.use(bodyParser.json());

        // watch for post requests
        app.post(/.*/, function(req, res) {
            switch (req.headers['x-amz-sns-message-type']) {
                
                // forward notification to the callback
                case 'Notification':
                    logger.log('Received Notification: ' + JSON.stringify(req.body, null, 2));
                    callback(req.body);
                    break;
                
                // confirm subscription to the topic
                case 'SubscriptionConfirmation':
                    logger.log('Received SubscriptionConfirmation: ' + JSON.stringify(req.body, null, 2));
                    const params = {
                        Token: req.body.Token,
                        TopicArn: req.body.TopicArn
                    };
                    sns.confirmSubscription(params, function(err) {
                        if (err) return reject(err);
                        resolve(app);
                    });
                    break;
                
                // confirm unsubscription from the topic
                case 'UnsubscribeConfirmation':
                    break;
            }

            // send an empty response
            res.end();
        });

        // set the app to listen on the port
        app.server = app.listen(config.port, function(err) {
            if (err) return reject(err);

            // initiate subscription to the topic
            const params = {
                Protocol: protocol,
                TopicArn: config.topicArn,
                Endpoint: config.endpoint
            };
            sns.subscribe(params, function(err) {
                if (err) return reject(err);
            });
        });
    });
};