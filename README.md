[![npm version](https://badge.fury.io/js/graphql-subscriptions.svg)](https://badge.fury.io/js/graphql-subscriptions) [![GitHub license](https://img.shields.io/github/license/apollostack/graphql-subscriptions.svg)](https://github.com/apollographql/graphql-subscriptions/blob/master/LICENSE)

# graphql-subscriptions

GraphQL subscriptions is a simple npm package that lets you wire up GraphQL with a pubsub system (like Redis) to implement subscriptions in GraphQL.

You can use it with any GraphQL client and server (not only Apollo).

### Installation

`npm install graphql-subscriptions graphql` or `yarn add graphql-subscriptions graphql`

> This package should be used with a network transport, for example [subscriptions-transport-ws](https://github.com/apollographql/subscriptions-transport-ws).

### TypeScript

If you are developing a project that uses this module with TypeScript:

- ensure that your `tsconfig.json` `lib` definition includes `"es2018.asynciterable"`
- `npm install @types/graphql` or `yarn add @types/graphql`

### Getting started with your first subscription

To begin with GraphQL subscriptions, start by defining a GraphQL `Subscription` type in your schema:

```graphql
type Subscription {
  somethingChanged: Result
}

type Result {
  id: String
}
```

Next, add the `Subscription` type to your `schema` definition:

```graphql
schema {
  query: Query
  mutation: Mutation
  subscription: Subscription
}
```

Now, let's create a simple `PubSub` instance - it is a simple pubsub implementation, based on `EventEmitter`. Alternative `EventEmitter` implementations can be passed by an options object
to the `PubSub` constructor.

```js
import { PubSub } from "graphql-subscriptions";

export const pubsub = new PubSub();
```

If you're using TypeScript you can use the optional generic parameter for added type-safety:

```ts
import { PubSub } from "graphql-subscriptions";

const pubsub = new PubSub<{
  EVENT_ONE: { data: number };
  EVENT_TWO: { data: string };
}>();

pubsub.publish("EVENT_ONE", { data: 42 });
pubsub.publish("EVENTONE", { data: 42 }); // ! ERROR
pubsub.publish("EVENT_ONE", { data: "42" }); // ! ERROR
pubsub.publish("EVENT_TWO", { data: "hello" });

pubsub.subscribe("EVENT_ONE", () => {});
pubsub.subscribe("EVENTONE", () => {}); // ! ERROR
pubsub.subscribe("EVENT_TWO", () => {});
```

Next implement your Subscriptions type resolver using the `pubsub.asyncIterableIterator` to map the event you need:

```js
const SOMETHING_CHANGED_TOPIC = "something_changed";

export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: () => pubsub.asyncIterableIterator(SOMETHING_CHANGED_TOPIC),
    },
  },
};
```

> Subscriptions resolvers are not a function, but an object with `subscribe` method, that returns `AsyncIterable`.

The GraphQL engine now knows that `somethingChanged` is a subscription, and every time we use `pubsub.publish` it will publish content using our chosen transport layer:

```js
pubsub.publish(SOMETHING_CHANGED_TOPIC, { somethingChanged: { id: "123" } });
```

> Note that the default PubSub implementation is intended for demo purposes. It only works if you have a single instance of your server and doesn't scale beyond a couple of connections.
> For production usage you'll want to use one of the [PubSub implementations](#pubsub-implementations) backed by an external store. (e.g. Redis)

### Filters

When publishing data to subscribers, we need to make sure that each subscriber gets only the data it needs.

To do so, we can use `withFilter` helper from this package, which wraps `AsyncIterator` with a filter function, and lets you control each publication for each user.

`withFilter` API:

- `asyncIteratorFn: (rootValue, args, context, info) => AsyncIterator<any>` : A function that returns `AsyncIterator` you got from your `pubsub.asyncIterableIterator`.
- `filterFn: (payload, variables, context, info) => boolean | Promise<boolean>` - A filter function, executed with the payload (the published value), variables, context and operation info, must return `boolean` or `Promise<boolean>` indicating if the payload should pass to the subscriber.

For example, if `somethingChanged` would also accept a variable with the ID that is relevant, we can use the following code to filter according to it:

```js
import { withFilter } from "graphql-subscriptions";

const SOMETHING_CHANGED_TOPIC = "something_changed";

export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator(SOMETHING_CHANGED_TOPIC),
        (payload, variables) => {
          return payload.somethingChanged.id === variables.relevantId;
        }
      ),
    },
  },
};
```

> Note that when using `withFilter`, you don't need to wrap your return value with a function.

### Channels Mapping

You can map multiple channels into the same subscription, for example when there are multiple events that trigger the same subscription in the GraphQL engine.

```js
const SOMETHING_UPDATED = "something_updated";
const SOMETHING_CREATED = "something_created";
const SOMETHING_REMOVED = "something_removed";

export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: () =>
        pubsub.asyncIterableIterator([
          SOMETHING_UPDATED,
          SOMETHING_CREATED,
          SOMETHING_REMOVED,
        ]),
    },
  },
};
```

### Payload Manipulation

You can also manipulate the published payload, by adding `resolve` methods to your subscription:

```js
const SOMETHING_UPDATED = "something_updated";

export const resolvers = {
  Subscription: {
    somethingChanged: {
      resolve: (payload, args, context, info) => {
        // Manipulate and return the new value
        return payload.somethingChanged;
      },
      subscribe: () => pubsub.asyncIterableIterator(SOMETHING_UPDATED),
    },
  },
};
```

Note that `resolve` methods execute _after_ `subscribe`, so if the code in `subscribe` depends on a manipulated payload field, you will need to factor out the manipulation and call it from both `subscribe` and `resolve`.

### Usage with callback listeners

Your database might have callback-based listeners for changes, for example something like this:

```js
const listenToNewMessages = (callback) => {
  return db.table("messages").listen((newMessage) => callback(newMessage));
};

// Kick off the listener
listenToNewMessages((message) => {
  console.log(message);
});
```

The `callback` function would be called every time a new message is saved in the database. Unfortunately, that doesn't play very well with async iterators out of the box because callbacks are push-based, where async iterators are pull-based.

We recommend using the [`callback-to-async-iterator`](https://github.com/withspectrum/callback-to-async-iterator) module to convert your callback-based listener into an async iterator:

```js
import asyncify from "callback-to-async-iterator";

export const resolvers = {
  Subscription: {
    somethingChanged: {
      subscribe: () => asyncify(listenToNewMessages),
    },
  },
};
```

### Custom `AsyncIterator` Wrappers

The value you should return from your `subscribe` resolver must be an `AsyncIterable`.

You can wrap an `AsyncIterator` with custom logic for your subscriptions. For compatibility with APIs that require `AsyncIterator` or `AsyncIterable`, your wrapper can return an `AsyncIterableIterator` to comply with both.

For example, the following implementation manipulates the payload by adding some static fields:

```typescript
export const withStaticFields = (
  asyncIterator: AsyncIterator<any>,
  staticFields: Object
): Function => {
  return (
    rootValue: any,
    args: any,
    context: any,
    info: any
  ): AsyncIterableIterator<any> => {
    return {
      next() {
        return asyncIterator.next().then(({ value, done }) => {
          return {
            value: {
              ...value,
              ...staticFields,
            },
            done,
          };
        });
      },
      return() {
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error) {
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
};
```

> You can also take a look at `withFilter` for inspiration.

### PubSub Implementations

It can be easily replaced with some other implementations of [PubSubEngine abstract class](https://github.com/apollographql/graphql-subscriptions/blob/master/src/pubsub-engine.ts). Here are a few of them:

- Use Redis with https://github.com/davidyaha/graphql-redis-subscriptions
- Use Google PubSub with https://github.com/axelspringer/graphql-google-pubsub
- Use MQTT enabled broker with https://github.com/aerogear/graphql-mqtt-subscriptions
- Use RabbitMQ with https://github.com/cdmbase/graphql-rabbitmq-subscriptions
- Use AMQP (RabbitMQ) with https://github.com/Surnet/graphql-amqp-subscriptions
- Use Kafka with https://github.com/ancashoria/graphql-kafka-subscriptions
- Use Kafka (using [Kafkajs](https://www.npmjs.com/package/kafkajs)) with https://github.com/tomasAlabes/graphql-kafkajs-subscriptions
- Use Postgres with https://github.com/GraphQLCollege/graphql-postgres-subscriptions
- Use NATS with https://github.com/moonwalker/graphql-nats-subscriptions
- Use Mongoose (MongoDB) with https://github.com/Nickolasmv/graphql-mongoose-subscriptions
- Use multiple backends with https://github.com/jcoreio/graphql-multiplex-subscriptions
- Use Ably for multi-protocol support with https://github.com/ably-labs/graphql-ably-pubsub
- Use Google Firestore with https://github.com/m19c/graphql-firestore-subscriptions
- Use Amazon's Simple Notification Service (SNS) and Simple Queue Service (SQS) with https://github.com/sagahead-io/graphql-snssqs-subscriptions
- [Add your implementation...](https://github.com/apollographql/graphql-subscriptions/pull/new/master)

You can also implement a `PubSub` of your own, by using the exported abstract class `PubSubEngine` from this package. By using `extends PubSubEngine` you use the default `asyncIterator` method implementation; by using `implements PubSubEngine` you must implement your own `AsyncIterator`.

#### SubscriptionManager **@deprecated**

`SubscriptionManager` is the previous alternative for using `graphql-js` subscriptions directly, and it's now deprecated.

If you are looking for its API docs, refer to [a previous commit of the repository](https://github.com/apollographql/graphql-subscriptions/blob/5eaee92cd50060b3f3637f00c53960f51a07d0b2/README.md)
