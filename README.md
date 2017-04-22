[![npm version](https://badge.fury.io/js/graphql-subscriptions.svg)](https://badge.fury.io/js/graphql-subscriptions) [![GitHub license](https://img.shields.io/github/license/apollostack/graphql-subscriptions.svg)](https://github.com/apollostack/graphql-subscriptions/blob/license/LICENSE)

# graphql-subscriptions

GraphQL subscriptions is a simple npm package that lets you wire up GraphQL with a pubsub system (like Redis) to implement subscriptions in GraphQL.

> `graphql-subscriptions` is an extension for GraphQL, and you can use it with any GraphQL client and server (not only Apollo).

### Installation

`npm install graphql-subscriptions`

> This package should be used with a network transport, for example [`subscriptions-transport-ws`](https://github.com/apollographql/subscriptions-transport-ws).

### Getting started

The package exports `PubSub` and `SubscriptionManager`.

#### PubSub

`PubSub` is a simple pubsub implementation and is recommended only for use in development. It can be easily replaced with something like Redis and https://github.com/davidyaha/graphql-redis-subscriptions.

You will then call `pubsub.publish('channelName', data)` to publish `data` to the `channelName` channel. This might happen inside a mutation resolver, for example.

#### SubscriptionManager

Create a new instance of SubscriptionManager and pass in your `schema` and `pubsub` instance. 

The `setupFunctions` property is used to map subscription names (from your schema) to pubsub channel names. You can also provide filter functions to, for example, filter channel events based on query variables and the properties of the object published to the channel.

Note: Typically, your `SubscriptionManager` will be passed to something like https://github.com/apollographql/subscriptions-transport-ws and its `SubscriptionServer`.

### Example usage

Note: This example only demonstrates the `graphql-subscriptions` package. Take a look at [this article](https://dev-blog.apollodata.com/graphql-subscriptions-in-apollo-client-9a2457f015fb) for a more in-depth look at GraphQL subscriptions and how to use this package with `subscriptions-transport-ws` and a GraphQL client like Apollo.

```js
import { PubSub, SubscriptionManager } from 'graphql-subscriptions';
import schema from './schema';

const pubsub = new PubSub();

const subscriptionManager = new SubscriptionManager({
  schema,
  pubsub,

  // In this example we map the "commentAdded" subscription to the "newComments" channel.
  // The  subscription is then called each time a new comment is posted where the
  // comment's `repoFullName` matches the `repoName` provided by the query.
  setupFunctions: {
    commentAdded: (options, args) => ({
      newComments: {
        filter: comment => comment.repoFullName === args.repoName,
      },
    }),
  },
});

// Start a subscription. In normal usage you would do this client-side using something like subscriptions-transport-ws
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

// Publish a comment to the "newComments" channel, potentially triggering a call to a matching subscription.
// For example, pubsub.publish() might be triggered inside a "createComment" mutation, after the comment has
// been created and added to the database.

pubsub.publish('newComments', {
  id: 123,
  content: 'Hello world!',
  repoFullName: 'apollostack/GitHunt-API',
  postedBy: 'helfer',
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



