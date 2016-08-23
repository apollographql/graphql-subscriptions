import {
  assert,
  expect,
} from 'chai';

import {
  parse,
  validate,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';

import {
    FilteredPubSub,
    SubscriptionManager,
} from '../pubsub';

import { subscriptionHasSingleRootField } from '../validation';

describe('FilteredPubSub', function() {
  it('can subscribe and is called when events happen', function(done) {
    const ps = new FilteredPubSub();
    ps.subscribe('a', () => true, payload => {
      expect(payload).to.equals('test');
      done();
    });
    ps.publish('a', 'test');
  });

  it('can filter events that get sent to subscribers', function(done) {
    const ps = new FilteredPubSub();
    ps.subscribe('a', payload => payload !== 'bad', payload => {
      expect(payload).to.equals('good');
      done();
    });
    ps.publish('a', 'bad');
    ps.publish('a', 'good');
  });

  it('can unsubscribe', function(done) {
    const ps = new FilteredPubSub();
    const subId = ps.subscribe('a', () => true, payload => {
      assert(false);
    });
    ps.unsubscribe(subId);
    ps.publish('a', 'test');
    done(); // works because pubsub is synchronous
  });
});

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      testString: {
        type: GraphQLString,
        resolve: function (_, args) {
          return 'works';
        },
      },
    },
  }),
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      testSubscription: {
        type: GraphQLString,
        resolve: function (root) {
          return root;
        },
      },
      testFilter: {
        type: GraphQLString,
        resolve: function (root, { filterBoolean }) {
          return filterBoolean ? 'goodFilter' : 'badFilter';
        },
        args: {
          filterBoolean: { type: GraphQLBoolean },
        },
      },
    },
  }),
});

describe('SubscriptionManager', function() {
  const subManager = new SubscriptionManager({
    schema,
    filters: {
      'Filter1': (options) => {
        return (root) => root.filterBoolean === options.variables.filterBoolean;
      },
    },
   });
  it('throws an error if query is not valid', function() {
    const query = 'query a{ testInt }';
    const callback = () => null;
    return expect(
      () => subManager.subscribe({ query, operationName: 'a', callback })
    ).to.throw('Error: Subscription query has validation errors');
  });

  it('rejects subscriptions with more than one root field', function() {
    const query = 'subscription X{ a: testSubscription, b: testSubscription }';
    const callback = () => null;
    return expect(
      () => subManager.subscribe({ query, operationName: 'X', callback })
    ).to.throw('Error: Subscription query has validation errors');
  });

  it('requires operationName to be provided', function() {
    const query = 'subscription { testSubscription }';
    const callback = () => null;
    return expect(
      () => subManager.subscribe({ query, operationName: undefined as string, callback })
    ).to.throw('Must provide operationName');
  });

  it('can subscribe with a valid query and gets a subId back', function() {
    const query = 'subscription X{ testSubscription }';
    const callback = () => null;
    const subId = subManager.subscribe({ query, operationName: 'X', callback });
    expect(subId).to.be.a('number');
    subManager.unsubscribe(subId);
  });

  it('can subscribe with a valid query and get the root value', function(done) {
    const query = 'subscription X{ testSubscription }';
    const callback = function(err, payload){
      try {
        expect(payload.data.testSubscription).to.equals('good');
      } catch (e) {
        done(e);
        return;
      }
      done();
    };
    const subId = subManager.subscribe({ query, operationName: 'X', callback });
    subManager.publish('X', 'good');
    subManager.unsubscribe(subId);
  });

  it('can use filter functions properly', function(done) {
    const query = `subscription Filter1($filterBoolean: Boolean){
       testFilter(filterBoolean: $filterBoolean)
      }`;
    const callback = function(err, payload){
      try {
        expect(payload.data.testFilter).to.equals('goodFilter');
      } catch (e) {
        done(e);
        return;
      }
      done();
    };
    const subId = subManager.subscribe({
      query,
      operationName: 'Filter1',
      variables: { filterBoolean: true},
      callback,
    });
    subManager.publish('Filter1', {filterBoolean: false });
    subManager.publish('Filter1', {filterBoolean: true });
    subManager.unsubscribe(subId);
  });

  it('can unsubscribe', function(done) {
    const query = 'subscription X{ testSubscription }';
    const callback = (err, payload) => {
      try {
        assert(false);
      } catch (e) {
        done(e);
        return;
      }
      done();
    };
    const subId = subManager.subscribe({ query, operationName: 'X', callback });
    subManager.unsubscribe(subId);
    subManager.publish('X', 'bad');
    setTimeout(done, 5);
  });

  it('calls the error callback if there is an execution error', function(done) {
    const query = `subscription X($uga: Boolean!){
      testSubscription  @skip(if: $uga)
    }`;
    const callback = function(err, payload){
      try {
        expect(payload).to.be.undefined;
        expect(err.message).to.equals(
          'Variable "$uga" of required type "Boolean!" was not provided.'
        );
      } catch (e) {
        done(e);
        return;
      }
      done();
    };
    const subId = subManager.subscribe({ query, operationName: 'X', callback });
    subManager.publish('X', 'good');
    subManager.unsubscribe(subId);
  });
});


// ---------------------------------------------
// validation tests ....

// TODO: Gotta test it..

const validationSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      placeholder: { type: GraphQLString },
    },
  }),
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      test1: { type: GraphQLString },
      test2: { type: GraphQLString },
    },
  }),
});

describe('SubscriptionValidationRule', function() {
  it('should allow a valid subscription', function() {
    const sub = `subscription S1{
      test1
    }`;
    const errors = validate(validationSchema, parse(sub), [subscriptionHasSingleRootField]);
    expect(errors.length).to.equals(0);
  });

  it('should allow another valid subscription', function() {
    const sub = `
    subscription S1{
      test1
    }
    subscription S2{
      test2
    }`;
    const errors = validate(validationSchema, parse(sub), [subscriptionHasSingleRootField]);
    expect(errors.length).to.equals(0);
  });

  it('should allow two valid subscription definitions', function() {
    const sub = `subscription S2{
      test2
    }`;
    const errors = validate(validationSchema, parse(sub), [subscriptionHasSingleRootField]);
    expect(errors.length).to.equals(0);
  });


  it('should not allow two fields in the subscription', function() {
    const sub = `subscription S3{
      test1
      test2
    }`;
    const errors = validate(validationSchema, parse(sub), [subscriptionHasSingleRootField]);
    expect(errors.length).to.equals(1);
    expect(errors[0].message).to.equals('Subscription "S3" must have only one field.');
  });

  it('should not allow inline fragments', function() {
    const sub = `subscription S4{
      ... on Subscription {
        test1
      }
    }`;
    const errors = validate(validationSchema, parse(sub), [subscriptionHasSingleRootField]);
    expect(errors.length).to.equals(1);
    expect(errors[0].message).to.equals('Apollo subscriptions do not support fragments on the root field');
  });

  it('should not allow named fragments', function() {
    const sub = `subscription S5{
      ...testFragment
    }

    fragment testFragment on Subscription{
      test2
    }`;
    const errors = validate(validationSchema, parse(sub), [subscriptionHasSingleRootField]);
    expect(errors.length).to.equals(1);
    expect(errors[0].message).to.equals('Apollo subscriptions do not support fragments on the root field');
  });
});
