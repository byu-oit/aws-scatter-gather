# aws-scatter-gather

## Aggregators

**Define an Aggregator**

For this example, the code resides in `aggregators.js`.

```js
const Scather = require('aws-scatter-gather');

// define an aggregator
exports.greetings = Scather.aggregator({
    composer: function(responses) {
        const str = Object.keys(responses)
            .map(function(language) {
                return language + ': ' + responses[language];
            })
            .join('\n\t');
        return 'Greetings in multiple languages: \n\t' + str;
    },
    expects: ['english'],
    maxWait: 2500,
    minWait: 0,
    responseArn: 'arn:aws:sns:us-west-2:064824991063:ResponseTopic',
    topicArn: 'arn:aws:sns:us-west-2:064824991063:RequestTopic'
});
```

**Unit Testing**

Check that your aggregator is running as expected.

```js
const aggregators = require('./aggregators');
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

## Lambdas

**Define a Lambda**

For this example, the code resides in `lambda.js`.

Notice that there are examples for a callback paradigm and a promise paradigm. You only need one.

```js
const Scather = require('aws-scatter-gather');

exports.handler = Scather.lambda(exports.english);

// promise paradigm
exports.english = Scather.response(function(data) {
    return 'Hello, ' + data;
});

// callback paradigm
exports.english = Scather.response(function(data, callback) {
    callback(null, 'Hello, ' + data);
});
```

**Unit Testing**

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