import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

import {
  parse,
  validate,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLBoolean,
} from 'graphql';

import {
    PubSub,
    SubscriptionManager,
} from '../pubsub';

import { subscriptionHasSingleRootField } from '../validation';

chai.use(chaiAsPromised);
const expect = chai.expect;
const assert = chai.assert;

describe('PubSub', function() {
  it('can subscribe and is called when events happen', function(done) {
    const ps = new PubSub();
    ps.subscribe('a', payload => {
      expect(payload).to.equals('test');
      done();
    }).then(() => {
      const succeed = ps.publish('a', 'test');
      expect(succeed).to.be.true;
    });
  });

  it('can unsubscribe', function(done) {
    const ps = new PubSub();
    ps.subscribe('a', payload => {
      assert(false);
    }).then((subId) => {
      ps.unsubscribe(subId);
      const succeed = ps.publish('a', 'test');
      expect(succeed).to.be.true; // True because publish success is not
                                  // indicated by trigger having subscriptions
      done(); // works because pubsub is synchronous
    });
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
      testFilterMulti: {
        type: GraphQLString,
        resolve: function (root, { filterBoolean }) {
          return filterBoolean ? 'goodFilter' : 'badFilter';
        },
        args: {
          filterBoolean: { type: GraphQLBoolean },
          a: { type: GraphQLString },
          b: { type: GraphQLInt },
        },
      },
    },
  }),
});

describe('SubscriptionManager', function() {
  const subManager = new SubscriptionManager({
    schema,
    setupFunctions: {
      'testFilter': (options, { filterBoolean }) => {
        return {
          'Filter1': (root) => root.filterBoolean === filterBoolean,
        };
      },
      'testFilterMulti': (options) => {
        return {
          'Trigger1': () => true,
          'Trigger2': () => true,
        };
      },
    },
    pubsub: new PubSub(),
   });
  it('throws an error if query is not valid', function() {
    const query = 'query a{ testInt }';
    const callback = () => null;
    return expect(subManager.subscribe({ query, operationName: 'a', callback }))
        .to.eventually.be.rejectedWith('Subscription query has validation errors');
  });

  it('rejects subscriptions with more than one root field', function() {
    const query = 'subscription X{ a: testSubscription, b: testSubscription }';
    const callback = () => null;
    return expect(subManager.subscribe({ query, operationName: 'X', callback }))
      .to.eventually.be.rejectedWith('Subscription query has validation errors');
  });

  it('requires operationName to be provided', function() {
    const query = 'subscription { testSubscription }';
    const callback = () => null;
    return expect(subManager.subscribe({ query, operationName: undefined as string, callback }))
      .to.eventually.be.rejectedWith('Must provide operationName');
  });

  it('can subscribe with a valid query and gets a subId back', function() {
    const query = 'subscription X{ testSubscription }';
    const callback = () => null;
    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      expect(subId).to.be.a('number');
      subManager.unsubscribe(subId);
    });
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

    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      subManager.publish('testSubscription', 'good');
      subManager.unsubscribe(subId);
    });
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
    subManager.subscribe({
      query,
      operationName: 'Filter1',
      variables: { filterBoolean: true},
      callback,
    }).then(subId => {
      subManager.publish('Filter1', {filterBoolean: false });
      subManager.publish('Filter1', {filterBoolean: true });
      subManager.unsubscribe(subId);
    });
  });

  it('can subscribe to more than one trigger', function(done) {
    // I also used this for testing arg parsing (with console.log)
    // args a and b can safely be removed.
    // TODO: write real tests for argument parsing
    let triggerCount = 0;
    const query = `subscription multiTrigger($filterBoolean: Boolean, $uga: String){
       testFilterMulti(filterBoolean: $filterBoolean, a: $uga, b: 66)
      }`;
    const callback = function(err, payload){
      try {
        expect(payload.data.testFilterMulti).to.equals('goodFilter');
        triggerCount++;
      } catch (e) {
        done(e);
        return;
      }
      if (triggerCount === 2) {
        done();
      }
    };
    subManager.subscribe({
      query,
      operationName: 'multiTrigger',
      variables: { filterBoolean: true, uga: 'UGA'},
      callback,
    }).then(subId => {
      subManager.publish('NotATrigger', {filterBoolean: false});
      subManager.publish('Trigger1', {filterBoolean: true });
      subManager.publish('Trigger2', {filterBoolean: true });
      subManager.unsubscribe(subId);
    });
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
    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      subManager.unsubscribe(subId);
      subManager.publish('testSubscription', 'bad');
      setTimeout(done, 30);
    });
  });

  it('throws an error when trying to unsubscribe from unknown id', function () {
    expect(() => subManager.unsubscribe(123))
      .to.throw('undefined');
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

    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      subManager.publish('testSubscription', 'good');
      subManager.unsubscribe(subId);
    });
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
