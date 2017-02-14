import * as sinon from 'sinon';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinonChai from 'sinon-chai';

import {
  parse,
  validate,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLBoolean,
  ExecutionResult,
} from 'graphql';

import { PubSub } from '../pubsub';
import { SubscriptionManager } from '../SubscriptionManager';

import { subscriptionHasSingleRootField } from '../validation';

chai.use(chaiAsPromised);
chai.use(sinonChai);
const expect = chai.expect;
const assert = chai.assert;

describe('PubSub', function() {
  it('can subscribe and is called when events happen', function(done) {
    const ps = new PubSub();
    ps.subscribe('a', payload => {
      expect(payload).to.equals('test');
      done();
    }, undefined).then(() => {
      const succeed = ps.publish('a', 'test');
      expect(succeed).to.be.true;
    });
  });

  it('can unsubscribe', function(done) {
    const ps = new PubSub();
    ps.subscribe('a', payload => {
      assert(false);
    }, undefined).then((subId) => {
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
      testContext: {
        type: GraphQLString,
        resolve(rootValue, args, context) {
          return context;
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
      testChannelOptions: {
        type: GraphQLString,
        resolve: function (root) {
          return root;
        },
      },
      testArguments: {
        type: GraphQLString,
        resolve: (root, { testArgument }) => {
          return String(testArgument);
        },
        args: {
          testArgument: {
            type: GraphQLInt,
            defaultValue: 1234,
          },
        },
      },
    },
  }),
});

describe('SubscriptionManager', function() {
  let capturedArguments: Object;
  const pubsub = new PubSub();

  const subManager = new SubscriptionManager({
    schema,
    setupFunctions: {
      'testFilter': (options, { filterBoolean }) => {
        return {
          'Filter1': {
            filter: (root) => root.filterBoolean === filterBoolean,
          },
          Filter2: {
            filter: (root) => {
              return new Promise((resolve) => {
                setTimeout(() => resolve(root.filterBoolean === filterBoolean), 10);
              });
            },
          },
        };
      },
      'testFilterMulti': (options) => {
        return {
          'Trigger1': {
            filter: () => true,
          },
          'Trigger2': {
            filter: () => true,
          },
        };
      },
      'testChannelOptions': () => {
        return {
          'Trigger1': {
            channelOptions: {
              foo: 'bar',
            },
          },
        };
      },
      testContext(options) {
        return {
          contextTrigger(rootValue, context) {
            return context === 'trigger';
          },
        };
      },
      testArguments(opts, args) {
        capturedArguments = args;
        return {
          Trigger1: {},
        };
      },
    },
    pubsub,
   });

  beforeEach(() => {
    capturedArguments = undefined;
    sinon.spy(pubsub, 'subscribe');
  });

  afterEach(() => {
    sinon.restore(pubsub.subscribe);
  });

  it('throws an error if query is not valid', function() {
    const query = 'query a{ testInt }';
    const callback = () => null;
    return expect(subManager.subscribe({ query, operationName: 'a', callback }))
        .to.eventually.be.rejectedWith('Subscription query has validation errors');
  });

  it('rejects subscriptions with more than one root field', function() {
    const query = 'subscription X{ a: testSubscription, b: testSubscription }';
    return new Promise((resolve, reject) => {
      const callback = (e, v) => e ? reject(e) : resolve(v);
      subManager.subscribe({ query, operationName: 'X', callback });
    }).then((result: ExecutionResult) => {
      expect(result.data).to.be.not.ok;
      expect(result.errors).to.be.a('array');
      expect(result.errors[0].message).to.be.equal('Subscription query has validation errors');
    });
  });

  it('can subscribe with a valid query and gets a subId back', function() {
    const query = 'subscription X{ testSubscription }';
    const callback = () => null;
    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      expect(subId).to.be.a('number');
      subManager.unsubscribe(subId);
    });
  });

  it('can subscribe with a nameless query and gets a subId back', function() {
    const query = 'subscription { testSubscription }';
    const callback = () => null;
    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      expect(subId).to.be.a('number');
      subManager.unsubscribe(subId);
    });
  });

  it('can subscribe with a valid query and get the root value', function(done) {
    const query = 'subscription X{ testSubscription }';
    let subscriptionId = undefined;
    const callback = function(err, payload){
      subManager.unsubscribe(subscriptionId);
      try {
        if (err) {
          throw err;
        }

        expect(payload.data.testSubscription).to.equals('good');
      } catch (e) {
        return done(e);
      }
      return done();
    };

    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      subscriptionId = subId;
      pubsub.publish('testSubscription', 'good');
    });
  });

  it('can use filter functions properly', function(done) {
    const query = `subscription Filter1($filterBoolean: Boolean){
       testFilter(filterBoolean: $filterBoolean)
      }`;
    let subscriptionId = undefined;
    const callback = function(err, payload){
      subManager.unsubscribe(subscriptionId);
      if (err) {
        done(err);
        return;
      }
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
      subscriptionId = subId;
      pubsub.publish('Filter1', {filterBoolean: false });
      pubsub.publish('Filter1', {filterBoolean: true });
    });
  });

  it('can use a filter function that returns a promise', function(done) {
    const query = `subscription Filter2($filterBoolean: Boolean){
       testFilter(filterBoolean: $filterBoolean)
      }`;
    let subscriptionId = undefined;
    const callback = function(err, payload){
      subManager.unsubscribe(subscriptionId);

      if (err) {
        done(err);
        return;
      }
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
      operationName: 'Filter2',
      variables: { filterBoolean: true},
      callback,
    }).then(subId => {
      subscriptionId = subId;
      pubsub.publish('Filter2', {filterBoolean: false });
      pubsub.publish('Filter2', {filterBoolean: true });
    });
  });

  it('can subscribe to more than one trigger', function(done) {
    // I also used this for testing arg parsing (with console.log)
    // args a and b can safely be removed.
    // TODO: write real tests for argument parsing
    let triggerCount = 0;
    let subscriptionId = undefined;
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
        subManager.unsubscribe(subscriptionId);
        done();
      }
    };
    subManager.subscribe({
      query,
      operationName: 'multiTrigger',
      variables: { filterBoolean: true, uga: 'UGA'},
      callback,
    }).then(subId => {
      subscriptionId = subId;
      pubsub.publish('NotATrigger', {filterBoolean: false});
      pubsub.publish('Trigger1', {filterBoolean: true });
      pubsub.publish('Trigger2', {filterBoolean: true });
    });
  });

  it('can subscribe to a trigger and pass options to PubSub using "channelOptions"', function(done) {
    const query = 'subscription X{ testChannelOptions }';

    subManager.subscribe({
      query,
      operationName: 'X',
      callback: () => null,
    }).then(() => {
      expect(pubsub.subscribe).to.have.been.calledOnce;

      const expectedChannelOptions = {
        foo: 'bar',
      };
      expect(pubsub.subscribe).to.have.been.calledWith(
          sinon.match.string,
          sinon.match.func,
          expectedChannelOptions
      );

      done();
    }).catch(err => {
      done(err);
    });
  });

  it('can unsubscribe', function(done) {
    const query = 'subscription X{ testSubscription }';
    let subscriptionId = undefined;
    const callback = (err, payload) => {
      // will throw if called more then once.
      try {
        subManager.unsubscribe(subscriptionId);
      } catch (e) {
        return done(e);
      }

      // publish again after unsubscribe
      pubsub.publish('testSubscription', 'bad');

      setTimeout(done, 30);
    };
    subManager.subscribe({ query, operationName: 'X', callback }).then(subId => {
      subscriptionId = subId;
      pubsub.publish('testSubscription', 'bad');
    });
  });

  it('throws an error when trying to unsubscribe from unknown id', function () {
    expect(() => subManager.unsubscribe(123))
      .to.throw('is not a valid subscription id');
  });

  it('throws an error when trying to unsubscribe a second time', function () {
    const query = 'subscription X{ testSubscription }';
    return subManager.subscribe({ query, operationName: 'X', callback() { /* no publish */ } }).then(subId => {
      subManager.unsubscribe(subId);
      expect(() => subManager.unsubscribe(subId))
        .to.throw('is not a valid subscription id');
      });
  });

  it('calls the error callback if there is an execution error', function(done) {
    const query = `subscription X($uga: Boolean!){
      testSubscription  @skip(if: $uga)
    }`;
    let subscriptionId = undefined;
    const callback = function(err, payload){
      subManager.unsubscribe(subscriptionId);
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
      subscriptionId = subId;
      pubsub.publish('testSubscription', 'good');
    });
  });

  it('calls context if it is a function', function(done) {
    const query = `subscription TestContext { testContext }`;
    let subscriptionId = undefined;
    const callback = function(error, payload) {
      subManager.unsubscribe(subscriptionId);
      try {
        expect(error).to.be.undefined;
        expect(payload.data.testContext).to.eq('trigger');
      } catch (e) {
        return done(e);
      }
      return done();
    };
    const context = function() {
      return 'trigger';
    };
    subManager.subscribe({
      query,
      context,
      operationName: 'TestContext',
      variables: {},
      callback,
    }).then(subId => {
      subscriptionId = subId;
      pubsub.publish('contextTrigger', 'ignored');
    });
  });

  it('call the error callback if a context functions throws an error', function(done) {
    const query = `subscription TestContext { testContext }`;
    let subscriptionId = undefined;
    const callback = function(err, payload){
      subManager.unsubscribe(subscriptionId);
      try {
        expect(payload).to.be.undefined;
        expect(err.message).to.equals('context error');
      } catch (e) {
        done(e);
        return;
      }
      done();
    };
    const context = function() {
      throw new Error('context error');
    };
    subManager.subscribe({
      query,
      context,
      operationName: 'TestContext',
      variables: {},
      callback,
    }).then(subId => {
      subscriptionId = subId;
      pubsub.publish('contextTrigger', 'ignored');
    });
  });

  it('passes arguments to setupFunction', function(done) {
    const query = `subscription TestArguments {
      testArguments(testArgument: 10)
    }`;
    const callback = function(error, payload) {
      try {
        expect(error).to.be.null;
        expect(capturedArguments).to.eql({ testArgument: 10 });
        expect(payload.data.testArguments).to.equal('10');
        done();
      } catch (error) {
        done(error);
      }
    };
    subManager.subscribe({
      query,
      operationName: 'TestArguments',
      variables: {},
      callback,
    }).then(subId => {
      pubsub.publish('Trigger1', 'ignored');
      subManager.unsubscribe(subId);
    });
  });

  it('passes defaultValue of argument to setupFunction', function(done) {
    const query = `subscription TestArguments {
      testArguments
    }`;
    const callback = function(error, payload) {
      try {
        expect(error).to.be.null;
        expect(capturedArguments).to.eql({ testArgument: 1234 });
        expect(payload.data.testArguments).to.equal('1234');
        done();
      } catch (error) {
        done(error);
      }
    };
    subManager.subscribe({
      query,
      operationName: 'TestArguments',
      variables: {},
      callback,
    }).then(subId => {
      pubsub.publish('Trigger1', 'ignored');
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
