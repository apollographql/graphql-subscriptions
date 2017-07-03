## Using Observables for subscription

current implementation (Subscription Manager) is being used for a while now, and there are quiet few problems with it, which i want to address and show they are being solved using observables as the return value of the subscription resolver instead of current approach.

# Data source limitation
Current apollo implementation requires setting up a new WS server and provide it with a subscription protocol manager (subscription-transport-ws object) that defines the message types and handlers. 

The protocol manager needs a subscription manager object in order to handle the actual subscribe, unsubscribe and publish events.

The subscription manager class transfers the responsibility of storing and handling subscriptions and events to a pub sub adapter object.
Current pubsub adapter classes are:

 - in-memory event emitter based class which comes bundled in the subscription manager and is used mostly for development stages.
 - Redis PubSub adapter which manages the publish and subscribe on a redis server - https://github.com/davidyaha/graphql-redis-subscriptions
 - Postgres LISTEN/NOTIFY and update triggers as a pubsub adapter - https://github.com/jtmthf/graphql-postgres-subscriptions/
 - Mongo oplog reader that publishes it’s messages to channel names based on collection name and action taken - https://github.com/sebakerckhof/graphql-mongo-subscriptions/

*There is no way to use more than one adapter (Other than creating a custom mixed adapter)
The server has no standard way to figure out which user/session he is publishing data to.*

# Aggregation / throttling of events

GraphQL main goal is user experience for devices inside poor networks.

therefore giving the client ability to configure how frequent the updates will be is very helpful. (poor network -> lower updates, standard-network -> regular updates)

unfortunatly, current implementation doesn't allow any time-based operations on the subscription, just data manipulation.

# Code Readabilty / maintance

current apollo implementation provides a subscription manager which needs to be configured (subscription logical functions will go here as well) and then installed as the server.

this breaks GraphQL original architecture where the scheme defines *How* to resolve data, while context defines *Where* the data should come from.
also, the transport layer is now handling data instead of being able to handle transport.

so, a simple code to allow subscription will look like:
```javascript
import { PubSub, SubscriptionManager } from 'graphql-subscriptions';
import schema from './schema';
// the default PubSub is based on EventEmitters. It can easily
// be replaced with one different one, e.g. Redis
const pubsub = new PubSub();
const subscriptionManager = new SubscriptionManager({
  schema,
  pubsub,
  setupFunctions: {
    clock: (options, args) => ({
      clock: date => {
        // TODO: Handle throttle argument... to complicated for this example
        return date;
      },
  });
export { subscriptionManager, pubsub };

// This subscription manager will be passed to the ws transport layer which cannot be provided with a callback to handle transport data anymore.

// Somewhere else in the code
setTimeout(() => {
    pubsub.publish('clock', new Date());
}, 1000);
```

where this is the scheme:
```graphql
type Subscription {
    clock(throttle: Int): String
}
```

# Observables

The Observer and Observable interfaces provide a generalized mechanism for push-based notification, also known as the observer design pattern. The Observable object represents the object that sends notifications (the provider); the Observer object represents the class that receives them (the observer).
if you want to learn more about observables, i suggest you to watch [Everything is a stream](https://www.youtube.com/watch?v=UHI0AzD_WfY).
Observables are going to be nativly supported on ES7.
[more info](https://github.com/tc39/proposal-observable).

Observables are so powerful because they let you provide a provider function and a teardown function to define how to subscribe to data source and how to unsubscribe it. Observables also provide multicast ability so couple of "subscribers" can subscribe on the same provider, and then resource managment becomes much more efficeint.

Unlike EventEmitters, when using observables both sides can stop stream.
 - subscribe can call unsubscribe, which let the observable know that the stream might not be relevant anymore.
 - observable provide "complete" callback, to let the subscriber know that the stream is not relevant anymore.
 
one last important thing, is that observables supports operators, which let you pre-define actions that can be done on the stream.
also, depends on the observables library chosen, observable might already come with a very powerful operators toolbox.
for example, [RxJs](http://reactivex.io/rxjs/manual/overview.html#operators).

# Using Observables instead of current implementation

My suggestion, is to use Observables as the return value of the resolver, this way, the *How* to handle the data is being kept inside the scheme.
the observables themselves, can be just stored inside the context, so the context still defines the *Where*.
and the subscription manager is becoming reduntent, so we can add a transport layer callback.

an example code using observables might look like this:
```javascript
import { Observable } from 'rxjs';

const CONTEXT = {
  clock: Observable.interval(1000).map(() => new Date()).publishReplay(1).refCount(),
},

// In schema, implement clock resolver like it was a query.
clock(root, args, ctx) {
    if ( undefined === args.throttle ) {
        return ctx.clock;
    } else {
        return ctx.clock.throttleTime(args.throttle);
    }
},
```
