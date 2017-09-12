# aws-scatter-gather

An NPM package that facilitates the scatter gather design pattern using AWS SNS Topics. This model requires two components: aggregators that make the request, and responders that respond to the request.

[Tell me more!]('#about')

## Examples

Similar examples can be found in the `examples` directory that is included as part of this package.

### Aggregators

The aggregator has the role of initiating a request. It sends the request data out to the specified SNS Topic and it gathers responses back that are intended for it alone.

**Define an Aggregator**

When an aggregator is created, what you've done is create a function that can be called to aggregate send the request and gather responses.

- File location: `examples/with-lambda/aggegator/index.js`
- To see configuration options, [look at the API](#aggregator--configuration-object---function).

```js
const AWS           = require('aws-sdk');
const Scather       = require('aws-scatter-gather');

exports.greetings = Scather.aggregator({
    // transform each response - it's also possible to do this with "each" property by modifying the received object's data.
    composer: function(responses) {
        const str = Object.keys(responses)
            .map(function(language) {
                return language + ': ' + responses[language];
            })
            .join('\n\t');
        return 'Greetings in multiple languages: \n\t' + str;
    },
    
    // this example each function does that same thing as expects property
    each: function(received, state, done) {
        if (state.requested && received.name === 'english') {
            done();
        }
    },
    
    // expecing a response with the name of english
    expects: ['english'],
    
    // wait at least 0 milliseconds and at most 2500 milliseconds
    maxWait: 2500,
    minWait: 0,
    
    // provide the SNS object to use and specify the SNS ARN for sending and receiving
    responseArn: 'arn:aws:sns:us-west-2:064824991063:ResponseTopic',
    sns: new AWS.SNS({ region: 'us-west-2' }),
    topicArn: 'arn:aws:sns:us-west-2:064824991063:RequestTopic'
});
```

**Aggregator using Each**

```js
const AWS           = require('aws-sdk');
const Scather       = require('aws-scatter-gather');

exports.greetings = Scather.aggregator({
    each: function(response, state, done) {
        console.log(response);
        
    },
    minWait: 5000,
    responseArn: 'arn:aws:sns:us-west-2:064824991063:ResponseTopic',
    sns: new AWS.SNS({ region: 'us-west-2' }),
    topicArn: 'arn:aws:sns:us-west-2:064824991063:RequestTopic'
});
```

**Unit Testing**

You can test that your aggregator is running as expected without having to send anything across the network. This is helpful for debugging and development.

- File location: `examples/with-lambda/aggregator/test.js`
- Using `mock` allows you to provide the [response](#response) functions as the second parameter.

```js
const aggregators = require('./index');
const english = require('../lambdas/english/index').english;

// run mock aggregation - using a callback paradigm
aggregators.greetings.mock('James', [ english ], function(result) {
    console.log(result);
});

// run mock aggregation - using a promise paradigm
aggregators.greetings.mock('James', [ english ])
    .then(function(result) {
        console.log(result);
    });
```

**Integration**

Actually use SNS to communicate. You will need a server that is subscribed to the SNS Topic.

- File location: `examples/with-lambda/aggegator/server.js`
- Uses connect middleware communicate to and from AWS SNS Topics.

```js
const aggregators = require('./index.js');
const express = require('express');
const Scather = require('aws-scatter-gather');

// create an express app and add the scather sns middleware
const app = express();
app.use(Scather.middleware({
    endpoint: 'https://url-to-this-server.com',
    server: app,
    topics: ['arn:aws:sns:us-west-2:064824991063:ResponseTopic']
}));

// start the server listening on port 3000
app.listen(3000, function() {

    // aggregate results through the SNS Topics - using callback paradigm
    aggregators.greetings('James', function(err, data) {
        console.log(data);
    });

    // aggregate results through the SNS Topics - using promise paradigm
    aggregators.greetings('James')
        .then(function(data) {
            console.log(data);
        });
});
```

### Lambdas

**Define a Lambda**

- File location: `examples/with-lambda/lambdas/english/index.js`
- The example shows usage with a callback paradigm and a promise paradigm.
- The `Scather.response` takes a named function. In this case `english`.
- The `Scather.lambda` function does the work of receiving SNS Topic Notifications, calling its associated Scather responder function, and sending the response back to the aggregator.

```js
const Scather = require('aws-scatter-gather');

// callback paradigm
exports.response = Scather.response(function english(data, callback) {
    callback(null, 'Hello, ' + data);
});

// promise paradigm
exports.response = Scather.response(function english(data) {
    return 'Hello, ' + data;
});

exports.handler = Scather.lambda(exports.response);
```

**Unit Testing**

- File location: `examples/with-lambda/lambdas/english/test.js`
- Its difficult to debug code running on a lambda, so test locally when possible.

```js
const lambda = require('./index');

// callback paradigm
lambda.response('James', function(err, data) {
    console.log(data);
});

// promise paradigm
lambda.response('James')
    .then(function(data) {
        console.log(data);
    });
```

### Response

Response functions are subscribed to SNS events if you are running your own server. If you are using a lambda to capture SNS events then look to the [Lambdas](#lambdas) section for details.

- File location: `examples/with-server/server/server.js`

```js
const AWS = require('aws-sdk');
const express = require('express');
const Scather = require('aws-scatter-gather');

// create the sns instance
const sns = new AWS.SNS({ region: 'us-west-2' });

// create an express app and add the scather sns middleware
const app = express();
app.use(Scather.middleware({
    endpoint: 'http://url-to-this-server.com',
    server: app,
    sns: sns,
    topics: ['arn:aws:sns:us-west-2:064824991063:ResponseTopic']
}));

// using a handler function as input and using a callback paradigm
Scather.response(function English(data, callback) {
    callback(null, 'Hello, ' + data);
});

// using a configuration as input and using a promise paradigm
Scather.response({
    name: 'Chinese',
    sns: sns,
    handler: function (data) {      // promise paradigm because no second parameter is specified
        return 'Ni hao, ' + data;
    }
});

// start the server listening on port 3001
app.listen(3001, function() {
    console.log('Server listening on port 3001');
});
```

### Circuit Breaker

If a responder depends on an upstream API, an aggregator may be configured with a circuit breaker that will suspend the responder if the upstream API goes down.

- File location: `examples/with-circuitbreaker/aggregator/server.js`

```js
const AWS = require('aws-sdk');
const express = require('express');
const Scather = require('aws-scatter-gather');

// create an express app
const app = express();

// create a circuitbreaker
const circuitbreaker = Scather.circuitbreaker.config({
  // trip for 1 minute
  timeout: 1000 * 60,
  // trip if errors exceed 10% of requests
  errorThreshold: 0.1,
  // don't trip breaker on first fault if less than 10 requests per window
  lowLoadThreshold: 10,
  // Ten minute window
  windowSize: 1000 * 60 * 10
});

// add the scather sns middleware
app.use(Scather.middleware({
    endpoint: 'http://url-to-this-server.com',
    server: app,
    sns: new AWS.SNS({ region: 'us-west-2' }),
    topics: ['arn:aws:sns:us-west-2:064824991063:ResponseTopic']
}));

const echoes = Scather.aggregator({
    composer: function(responses) {
        const str = Object.keys(responses)
            .map(function(source) {
                return source + ': ' + responses[source];
            })
            .join('\n\t');
        return 'Echo from multiple sources: \n\t' + str;
    },
    expects: ['service'],
    maxWait: 2500,
    minWait: 0,
    responseArn: 'arn:aws:sns:us-west-2:064824991063:ResponseTopic',
    topicArn: 'arn:aws:sns:us-west-2:064824991063:RequestTopic',
    circuitbreaker: circuitbreaker
});

// start the server listening on port 3000
app.listen(3000, function() {
    console.log('Server listening on port 3000');

    // aggregate results through the SNS Topics - using callback paradigm
    echoes('EchoThisBack', function(err, data) {
        if(err) {
          console.error(JSON.stringify(err));
        }
        console.log(JSON.stringify(data));
    });

});
```

When the responder detects a fault in the upstream API, it should return an error with the attribute *circuitbreakerFault* set. In order to bypass a request once the circuit breaker has tripped, the response must be configured with a name, a handler function, and a bypass function:

- File location: `examples/with-circuitbreaker/lambdas/service/index.js`

```js
'use strict';
const Scather = require('aws-scatter-gather');
const request = require('request');

const snsArn = 'arn:aws:sns:us-west-2:064824991063:ResponseTopic';
function service(data) {
    const url = `http://echo.jsontest.com/data/${data}`;
    return new Promise(function(resolve, reject) {
        request(url, function(error, response, body) {
            if(error) {
                return reject(error);
            }
            if(response.statusCode !== 200) {
                return reject({
                    circuitbreakerFault: true,
                    statusCode: response.statusCode
                });
            }
            return resolve(body);
        });
    });
}

function bypass(data) {
    return JSON.stringify({
        data: 'Bypassed by circuit breaker'
    });
}

exports.response = Scather.response({
    name: 'service',
    handler: service,
    bypass: bypass
});

exports.handler = Scather.lambda(exports.response);
```

## API

### aggregator ( configuration: Object ) : Function

Produce an aggregator function that can be called to make a request and aggregate responses.

*Parameters*

- *configuration* - This parameter defines how the aggregator should send out the response and how to gather results. Options for the configuration are as follows:
    - *composer* - An optional function that can be defined to process and/or transform the results gathered in from a scatter request.
    - *each* - A function to call with each received response. This function will be passed the following parameters:
        1) received - The entire received object. To get the received object's payload use `recieved.data`. 
        2) state - The state object in this format: `{ active: boolean, minWaitReached: boolean, missing: Array.<string>`. Active tells whether the aggregator will continue to process additional responses.
        3) done - a function that can be used to signify that aggregation is done. You can pass in an error as it's first parameter if you want to reject the aggregator response.
    - *expects* - An array of strings for responses that are expected. If all expected responses have been received and the *minWait* has been reached then the aggregator will resolve immediately. Defaults to `[]`.
    - *maxWait* - The maximum number of milliseconds to wait for all expected responses before resolving the aggregator. Defaults to `2500`.
    - *minWait* - The minimum number of milliseconds to wait before resolving the aggregator. Defaults to `0`.
    - *name* - The aggregator function name. Defaults to `-`.
    - *responseArn* - The SNS Topic ARN that responders should send responses to. Defaults to match the *topicArn*.
    - *topicArn* - **REQUIRED** The SNS Topic ARN to send requests to. Responders will need to be listening on this Topic ARN.
    - *circuitbreaker* - An optional circuit breaker object which will track faulty requests and suspend responders if an upstream endpoint goes down

*Returns* a function that can take one or two arguments. The first argument is the data to send with the request. The second parameter is an optional callback function. If the callback is omitted then a Promise will be returned.

### event

Access the event interface. You probably don't need to do this unless you're building some sort of plugin. It's not really worth the effort to document this, yet.

### lambda ( handler: Function )

If the lambda function is invoked by an SNS Topic then the handler will be called with the relevant data. Once the handler completes the lambda function will route the response back to the aggregator.

*Parameters*

- *handler* - A function that can be called with an AWS SNS Topic notification payload. If the notification is an [aggregator](#aggregator--configuration-object---function) request then the [response](#response--handler-function---function) handler will be called with just the relevant request data.

*Returns* a function that is intended to be invoked by an SNS Topic event.

### middleware ( configuration: Object ) : Function

*Parameters*

- *configuration* - This parameter defines how the middlware should operate. Options for the configuration are as follows:
    - *endpoint* - The URL for the running server that needs to subscribe to SNS Topics. This must be a publicly accessible URL. If the server is running on EC2 (under Elasticbeanstalk for example) and the endpoint is not specified, it will be configured automatically. This option is especially helpful in a load-balanced environment to make sure each response callback is handled by the same instance it was requested from.
    - *passThrough* - A boolean indicating whether SNS Topic notifications should be passed to the server once processed. Defaults to `false`.
    - *server* - **REQUIRED** A reference to the server object that is incorperating this middleware.
    - *sns* - An AWS.SNS instance. Defaults to creating its own, but its own may not be configured property. You can configure it by setting SNS defaults or passing in your own AWS.SNS instance.
    - *subscribe* - A boolean indicating whether an SNS Topic subscription should automatically be made for any *topics* listed. There is no harm in attempting to resubscribe to a topic. Defaults to `true`.
    - *topics* - An array of Topic ARN strings that the middleware will handle requests for. Defaults to `[]`.
    - *useBodyParser* - Set to false if you are already implementing your own body parser middleware. This must be implemented prior to this middleware. Defaults to `true`.

### response ( handler: Function | Object ) : Function

Produce a response function.

*Parameters*

- *handler* - A function to call with request data or an object containing the handler. The handler function will be called with its defined signature (either using callbacks or promises). Note that when the handler is invoked, the invocation signature does not need to match the calling signature. The calling signature can use promises or callbacks, independent of the handler signature.

    If an object is used it takes these parameters:

        - *name* - The name of the function.
        - *sns* - The SNS instance to use. This cannot be defined if passing in a function instead of an object for the response parameter.
        - *handler* - The handler function to call.
        - *bypass* - If a circuit breaker is being used, the function to call if the upstream API is down.

*Returns* a function that can take one or two arguments. The first arguments is the data to have the response process. The second parameter is an optional callback function. If the callback is omitted then a Promise will be returned.

**Example of Free Form Paradigm Execution**

```js
// define response using the promise paradigm
const resP = Scather.response(function(data) {
    return 'Hello, ' + data;
});

// define a response using the callback paradigm
const resC = Scather.response(function(data, callback) {
    callback(null, 'Hello, ' + data);
});

// call resP using promise paradigm
resP('James')
    .then(function(data) {
        console.log(data);
    });

// call resP using callback paradigm
resP('James', function(err, data) {
    console.log(data);
});

// call resC using promise paradigm
resC('James')
    .then(function(data) {
        console.log(data);
    });

// call resC using callback paradigm
resC('James', function(err, data) {
    console.log(data);
});
```

### circuitbreaker ( handler: Function | Object ) : Object

Produce a circuitbreaker object. The circuit breaker will keep track of each request, and whether a successful response or a faulty response was the result. If enough responses are faulty within the request window, the circuit breaker will trip, bypassing requests for a time (the state will change from *closed* to *open*). Once the timeout has been reached, the state will change to *indeterminate*, where another faulty response will immediately change the state back to *open*. If a successful response is recorded instead, the state will be reset to *closed* and requests will operate normally.

*Parameters*

- *configuration* - This parameter defines how the circuit breaker should operate. Options for the configuration are as follows:
    - *timeout* - How long (in miliseconds) the request should be bypassed for once the circuit breaker is tripped
    - *errorThreshold* - The fraction of requests per window that can be faulty before the circuit breaker is tripped
    - *lowLoadThreshold* - The minimum number of requests to consider within a window. For example, if the expected load on your API is about 10 requests per minute, and your configured window size is 10 minutes, you could configure the lowLoadThreshold to be 100 so that a small number of faulty requests under lower than expected load conditions won't trip the breaker.
    - *windowSize* - The length of the window (in miliseconds) to analyze when faulty requests are detected.

*Returns* a circuit breaker object with the following methods:
- *request* - Called when a request is made.
- *fault* - Called when a faulty response is detected.
- *success* - Called when a successful response is detected.
- *state* - Returns the current state of the circuit breaker.



## About

A scatter-gather design pattern sends a single request to many servers and then aggregates the responses of those servers. Because this module uses AWS SNS Topics for communication it is using an asynchronous messaging pattern.

### What is an SNS Topic

An AWS SNS Topic is a messaging channel that any number of servers can subscribe to. When the SNS Topic receives an event it pushes that event to all servers that are subscribed to the topic.

### Synchronous vs Asynchronous Messaging

HTTP is commonly used to make synchronous requests:

1. A client initiates a connection with a server.
2. The client sends the request over that connection.
3. The server sends the response over that connection.
4. The connection is closed.

For asynchronous requests:

1. A client initiates a connection with a server.
2. The client sends the request over that connection.
3. The server confirms that the request was received.
4. The connection is closed.
5. At some point in the future:
    1. The server initiates a connection with the client*.
    2. The server sends the response to the client.
    3. The client confirms the response was received.
    4. The connection is closed.

\* *I am aware that the server is now the client and the client the server, but to keep things simple I kept their names the same.*

![Single SNS Topic Concept](./img/concept.png)

### Deciding on the Number of Topics

**Option 1**

The below image more accurately portrays messaging when using a single SNS Topic:

![Single SNS Topic Reality](./img/reality.png)

Using a single topic reduces initial set up, but it increases network traffic and the number of times requests are processed. The number of additional requests that would be made in this situation can be caluculated using this formula:

`N x N + 1`

`N` is the number of servers responding to the request.

So, if you have `5` servers that are responding to requests from the aggregator then you'll have a total of 26 additional requests that did not need to be made. Every requests will consume both consume the network bandwidth and processing time.

**Option 2**

An alternative is to use two SNS Topics:

1. Topic X can be subscribed to by all servers that are listing for requests. The client will make it's request to this topic.
2. Topic Y can be subscribed to by the client aggregating the responses. All servers will publish their responses to this topic.

Using this method no unneeded requests will be made.

![Double SNS Topic](./img/fix.png)
