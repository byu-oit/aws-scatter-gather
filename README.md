# aws-scatter-gather

An NPM package that facilitates the scatter gather design pattern using AWS SNS.

FYI: You can call this **Scather** (for short) because aws-scatter-gather is a mouthful.

Give Scather an event (this can by any data type) and Scather will post the event to an AWS SNS topic. Any subscribers to the SNS topic will receive the event and should use Scather to decode it and to post a response event back to the same SNS topic. Scather will gather the responses and produce a final result.

### Consider this code unstable for now - changes are going to occur before a stable release

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
const sns = new AWS.SNS();

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
    responses: ['increment', 'double']
};

// make a request by publishing an event and listening for
// events that are replies
scather.request(5, reqConfig)
    .then(function(results) {
        // ... process final results
    });
```

##### AWS Lambda Code

This lambda is subscribed to the topic that Scather is publishing events to.

```js
// require libraries
const AWS       = require('aws-sdk');
const Scather   = require('aws-scatter-gather');

// get instances
const sns = new AWS.SNS();
const scather = Scather(sns);

// define the SNS post handler
exports.handler = scather.response(function(event, context, callback) {
    // post 'Hello, World!' event as a response and provide
    // it as a response to the lambda being called.
    callback(null, 'Hello, World!');
});
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

## Request

Post an event to an AWS SNS Topic and subscribe to the same SNS topic for events that are specifically responses to this request.

### request ( sns [, config ] ) : Promise

**[Usage Example](#scatter-gather-code)**

**Parameters**

- **sns** - An AWS SNS instance.
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

## Response

Handle scather requests and provide a directed response event through AWS SNS.

Lambda functions can subscribe to the AWS SNS topic. The response is a function wrapper around the standard lambda handler. Within the callback function you add your logic and then call the callback with an error or data. Errors or data will be sent back to the gatherer and the lambda function will also get whatever value you pass in to the callback.

### response ( [ config, ] handler ) : Function

**[Usage Example](#aws-lambda-code)**

**Parameters**

- **config** - An optional response configuration, including:
    - **name** - The response name. If this response handler is for a lambda then by default the name will be the same as the lambda function.
    - **version** - The response version.
- **handler** - A function that takes 3 parameters: 1) event, 2) context, 3) callback. The callback must be called when the handler has completed.

**Returns** a function that the lambda function should execute.