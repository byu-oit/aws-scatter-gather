# aws-scatter-gather

An NPM package that facilitates the scatter gather design pattern using AWS SNS.

FYI: You can call this **Scather** (for short) because aws-scatter-gather is a mouthful.

Give Scather an event (this can by any data type) and Scather will post the event to an AWS SNS topic. Any subscribers to the SNS topic will receive the event and should use Scather to decode it and to post a response event back to the same SNS topic. Scather will gather the responses and produce a final result.

## Install

```sh
$ npm install aws-scatter-gather
```

## Usage

##### Scatter Gather Code

```js
// require libraries
const AWS       = require('aws-sdk');
const Scather   = require('aws-scatter-gather');

// create sns instance
const sns = new AWS.SNS({
    params: {
        TopicArn: 'arn:aws:sns:us-west-2:064824991063:TopicY'
    }
});

// create a scather instance
const scather = Scather(sns, {
    port: 9000,
    endpoint: 'http://public-endpoint.com',
    topicArn: 'arn:aws:sns:us-west-2:064824991063:TopicY'
});

// define the request configuration - how long to wait and what for
const reqConfig = {
    maxWait: 3000,
    minWait: 0,
    responses: ['increment']
};

// make a request by publishing an event and listening for
// events that are replies
scather.request(5, reqConfig)
    .then(function(results) {
        if (results.map.hasOwnProperty('increment')) {
            console.log('Incremented to: ' + results.map.increment);
        }
    });
```

##### AWS Lambda Code that Only Accepts Scatter Gather Request Events

If you are writing a Lambda function that should only accept events from scather requests then you'd write it like this. All other events will produce an error that the lambda function never sees.

The name of the lambda is *increment*, corresponding to the expected response by the scather requester.

```js
// require libraries
const AWS       = require('aws-sdk');
const Scather   = require('aws-scatter-gather');

// get instances
const sns = new AWS.SNS();
const scather = Scather(sns);

// define the SNS post handler
exports.handler = scather.response(function(event, context, callback) {
    callback(null, event + 1);
});
```

##### AWS Lambda Code for Any Event Type

If you don't know what type of events the lambda might receive then you can process the Scather events this way:

```js
// require libraries
const AWS       = require('aws-sdk');
const Scather   = require('aws-scatter-gather');

// define the lambda handler
exports.handler = function(event, context, callback) {

    // check if the event is a Scather request event
    if (Scather.isRequestEvent(event)) {

        // get instances
        const sns = new AWS.SNS();
        const scather = Scather(sns);

        // create a scather response function
        var fn = scather.response(function(event, context, callback) {
            callback(null, event + 1);
        });

        // call the function
        fn(event, context, callback);

    } else {
        // run other logic
    }
};
```

## Event Structure

The essential event structure contains:

- **data** - The data to publish with the event.
- **error** - An error to publish as an event. If present then the data will not be published as an event.
- **sender** - An object that tells you a little about the sender, including: name, version, and event identifiers.

## Scather Config

To create a scather instance you'll need to provide a configuration. These are the options:

- **endpoint** - The public URL to use to publish events to for the gatherer. Only required if you are gathering.
- **log** - A boolean that if true will indicate that scather logs should be output to the console. Defaults to `false`.
- **name** - A name to attach to events as the sender's name.
- **port** - A port to start the subscribed server on. Only required if you are gathering. Defaults to `11200`.
- **topicArn** - The AWS Topic ARN to publish to and subscribe to.
- **version** - An arbitrary value that helps to identify the version of the requester. Defaults to `"1.0"`.

## Scather Instance Methods

### end ( ) : Promise

If a request has been made then a server was also set up to gather AWS SNS response events. Calling this command will terminate the server. If a request is made and the server is not running then it will be started.

### request ( event [, config ] ) : Promise

Post an event to an AWS SNS Topic and subscribe to the same SNS topic for events that are specifically responses to this request.

**[Usage Example](#scatter-gather-code)**

**Parameters**

- **event** - The event data to publish.
- **config** - An optional request configuration, including:
    - **maxWait** - The maximum number of milliseconds to gather responses for.
    - **minWait** - The minimum number of milliseconds to gather responses for.
    - **responses** - An array of strings where each string is the name of a responder that you are expecting a response from. As soon as all responses are gathered then then request will be considered completed, unless it happened faster than the *minWait* duration.

**Returns** a promise that resolves to an array of all gathered response [events](#event-structure). The array also has additional properties:

- **map** - A map of response names to their [event](#event-structure).
- **additional.list** - An array of [events](#event-structure) that were received that were not expected but that were specifically directed at this gatherer.
- **additional.map** - A map of response names to their [event](#event-structure) that were not expected but that were specifically directed at this gatherer.
- **complete** - A boolean that indicates if all expected responses arrived.
- **expected.list** - An array of [events](#event-structure) that were received that were expected.
- **expected.map** - A map of response names to their [event](#event-structure) that were expected.
- **missing** - An array of names for responses that were expected that did not arrive.

**Parameters**

None

**Returns** a promise that resolves once the server has been shut down.

### response ( [ config, ] handler ) : Function

Handle scather requests and provide a directed response event through AWS SNS.

Lambda functions can subscribe to the AWS SNS topic. The response is a function wrapper around the standard lambda handler. Within the callback function you add your logic and then call the callback with an error or data. Errors or data will be sent back to the gatherer and the lambda function will also get whatever value you pass in to the callback.

**[Usage Example](#aws-lambda-code)**

**Parameters**

- **config** - An optional response configuration, including:
    - **name** - The response name. If this response handler is for a lambda then by default the name will be the same as the lambda function.
    - **version** - The response version.
- **handler** - A function that takes 3 parameters: 1) event, 2) context, 3) callback. The callback must be called when the handler has completed.

**Returns** a function that the lambda function should execute.

## Scather Static Methods

### isRequestEvent ( event ) : boolean

Determine if an event looks like a scather request event.

**Parameters**

- **event** - The data to send in the event. Can be any type of data that can be serialized.

**Returns** `true` if the event resembles a scather request event, otherwise `false`.

**Usage Example**

```js
const Scather   = require('aws-scatter-gather');

const result = Scather.isRequestEvent({});
console.log(result);        // false
```

### mock.requestEvent ( data ) : undefined

Create a mock request event that can be used against an AWS lambda function that expects scather events. Great for debugging lambdas before pushing them to AWS.

**Parameters**

- **data** - The data to send in the event. Can be any type of data that can be serialized.

**Returns** undefined

**Usage Example**

```js
// require libraries
const AWS       = require('aws-sdk');
const Scather   = require('aws-scatter-gather');

// get instances
const sns = new AWS.SNS();
const scather = Scather(sns);

// define the SNS post handler
exports.handler = scather.response(function(event, context, callback) {
    callback(null, event + 1);
});

// create a scather event
const event = Scather.mock.event(5);
exports.handler(event, null, function(err, data) {
    console.log(data);  // output is 6, from 5 + 1
});

```