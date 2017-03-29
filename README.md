[![npm version](https://badge.fury.io/js/graphql-subscriptions.svg)](https://badge.fury.io/js/graphql-subscriptions) [![GitHub license](https://img.shields.io/github/license/apollostack/graphql-subscriptions.svg)](https://github.com/apollostack/graphql-subscriptions/blob/license/LICENSE)

# graphql-subscriptions

GraphQL subscriptions is a simple npm package that lets you wire up GraphQL with a pubsub system (like Redis) to implement subscriptions in GraphQL.

> `graphql-subscriptions` is an extension for GraphQL, and you can use it with any GraphQL client and server (not only Apollo).

### Installation

`npm install graphql-subscriptions`

> This package should be used with a network transport, for example [`subscriptions-transport-ws`](https://github.com/apollographql/subscriptions-transport-ws).


### Example usage with SubscriptionManager

```js
import { PubSub, SubscriptionManager } from 'graphql-subscriptions';
import schema from './schema';

// PubSub can be easily replaced, for example with https://github.com/davidyaha/graphql-redis-subscriptions
const pubsub = new PubSub();

const subscriptionManager = new SubscriptionManager({
  schema,
  pubsub,

  // setupFunctions maps from subscription name to a map of channel names and their filter functions
  // in this case it will subscribe to the commentAddedChannel and re-run the subscription query
  // every time a new comment is posted whose repository name matches args.repoName.
  setupFunctions: {
    commentAdded: (options, args) => ({
      newCommentsChannel: {
        filter: comment => comment.repoFullName === args.repoName,
      },
    }),
  },
});

// start a subscription
subscriptionManager.subscribe({
  query: `
    subscription newComments($repoName: String!){
      commentAdded(repoName: $repoName) { # <-- this is the subscription name
        id
        content
        createdBy {
          username
        }
      }
    }
  `,
  variables: {
    repoName: 'apollostack/GitHunt-API',
  },
  context: {},
  callback: (err, data) => console.log(data),
});

// publish to the channel
pubsub.publish('newCommentsChannel', {
  id: 123,
  content: 'Test',
  repoFullName: 'apollostack/GitHunt-API',
  posted_by: 'helfer',
});

// the query will run, and the callback will print
// {
//   data: {
//     commentAdded: {
//       id: 123,
//       content: 'Test',
//       createdBy: {
//         username: 'helfer',
//       }
//     }
//   }
// }

```

### Example usage with GraphQLExecutorWithSubscriptions

```js
import { PubSub, GraphQLExecutorWithSubscriptions } from 'graphql-subscriptions';
import { parse } from 'graphql';
import schema from './schema';

// PubSub can be easily replaced, for example with https://github.com/davidyaha/graphql-redis-subscriptions
const pubsub = new PubSub();

const subscriptionExecutor = new GraphQLExecutorWithSubscriptions({
  pubsub,

  // setupFunctions maps from subscription name to a map of channel names and their filter functions
  // in this case it will subscribe to the commentAddedChannel and re-run the subscription query
  // every time a new comment is posted whose repository name matches args.repoName.
  setupFunctions: {
    commentAdded: (options, args) => ({
      newCommentsChannel: {
        filter: comment => comment.repository_name === args['repoName'],
      },
    }),
  },
});

// start a subscription
let result = subscriptionExecutor.executeReactive(
  schema,
  parse(`
    subscription newComments($repoName: String!){
      commentAdded(repoName: $repoName) { # <-- this is the subscription name
        id
        content
        createdBy
      }
    }
  `),
  undefined, // rootValue
  {}, // context
  {
    repoName: 'apollostack/GitHunt-API',
  }, // variables
  'newComments', // operationName
);

// subscribe for results
result.subscribe({
  next: (res) => console.log(res),
  error: (e) => console.error('error :', e),
  complete: () => console.log('complete'),
});

// publish to the channel
pubsub.publish('newCommentsChannel', {
  id: 123,
  content: 'Test',
  repository_name: 'apollostack/GitHunt-API',
  createdBy: 'helfer',
});

// the query will run, and the callback will print
// {
//   data: {
//     commentAdded: {
//       id: 123,
//       content: 'Test',
//       createdBy: 'helfer',
//     }
//   }
// }

```
