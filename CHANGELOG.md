# Changelog

### vNEXT
- ...

### 0.3.0
- Allow `setupFunctions` to be async (return `Promise`) (https://github.com/apollographql/graphql-subscriptions/pull/41)
- Refactor promise chaining in pubsub engine (https://github.com/apollographql/graphql-subscriptions/pull/41)
- Fixed a possible bug with managing subscriptions internally (https://github.com/apollographql/graphql-subscriptions/pull/29)
- Return the `Promise` from `onMessage` of PubSub engine (https://github.com/apollographql/graphql-subscriptions/pull/33)

### 0.2.3
- update `graphql` dependency to 0.9.0

### 0.2.2
- made `graphql` a peer dependency and updated it to 0.8.2

### v 0.2.1
- Fixed a bug that caused subscriptions without operationName to fail
