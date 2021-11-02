// chai style expect().to.be.true  violates no-unused-expression
/* tslint:disable:no-unused-expression */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { spy } from 'sinon';
import * as sinonChai from 'sinon-chai';

import { createAsyncIterator, isAsyncIterable } from 'iterall';
import { PubSub } from '../pubsub';
import { withFilter, FilterFn } from '../with-filter';
import { ExecutionResult } from 'graphql';

chai.use(chaiAsPromised);
chai.use(sinonChai);
const expect = chai.expect;

import {
  parse,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

import { subscribe } from 'graphql/subscription';

const FIRST_EVENT = 'FIRST_EVENT';

const defaultFilter = (payload) => true;

function buildSchema(iterator, filterFn: FilterFn = defaultFilter) {
  return new GraphQLSchema({
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
          subscribe: withFilter(() => iterator, filterFn),
          resolve: root => {
            return 'FIRST_EVENT';
          },
        },
      },
    }),
  });
}

describe('GraphQL-JS asyncIterator', () => {
  it('should allow subscriptions', async () => {
    const query = parse(`
      subscription S1 {

        testSubscription
      }
    `);
    const pubsub = new PubSub();
    const origIterator = pubsub.asyncIterator(FIRST_EVENT);
    const schema = buildSchema(origIterator);


    const results = await subscribe({schema, document: query}) as AsyncIterator<ExecutionResult>;
    const payload1 = results.next();

    expect(isAsyncIterable(results)).to.be.true;

    const r = payload1.then(res => {
      expect(res.value.data.testSubscription).to.equal('FIRST_EVENT');
    });

    pubsub.publish(FIRST_EVENT, {});

    return r;
  });

  it('should allow async filter', async () => {
    const query = parse(`
      subscription S1 {

        testSubscription
      }
    `);
    const pubsub = new PubSub();
    const origIterator = pubsub.asyncIterator(FIRST_EVENT);
    const schema = buildSchema(origIterator, () => Promise.resolve(true));

    const results = await subscribe({schema, document: query}) as AsyncIterator<ExecutionResult>;
    const payload1 = results.next();

    expect(isAsyncIterable(results)).to.be.true;

    const r = payload1.then(res => {
      expect(res.value.data.testSubscription).to.equal('FIRST_EVENT');
    });

    pubsub.publish(FIRST_EVENT, {});

    return r;
  });

  it('should detect when the payload is done when filtering', (done) => {
    const query = parse(`
      subscription S1 {
        testSubscription
      }
    `);

    const pubsub = new PubSub();
    const origIterator = pubsub.asyncIterator(FIRST_EVENT);

    let counter = 0;

    const filterFn = () => {
      counter++;

      if (counter > 10) {
        const e = new Error('Infinite loop detected');
        done(e);
        throw e;
      }

      return false;
    };

    const schema = buildSchema(origIterator, filterFn);

    subscribe({schema, document: query}).then((results: AsyncGenerator<ExecutionResult, void, void> | ExecutionResult) => {
      expect(isAsyncIterable(results)).to.be.true;

      (results as AsyncGenerator<ExecutionResult, void, void>).next();
      (results as AsyncGenerator<ExecutionResult, void, void>).return();

      pubsub.publish(FIRST_EVENT, {});

      setTimeout(_ => {
        done();
      }, 500);
    });
  });

  it('should clear event handlers', async () => {
    const query = parse(`
      subscription S1 {
        testSubscription
      }
    `);

    const pubsub = new PubSub();
    const origIterator = pubsub.asyncIterator(FIRST_EVENT);
    const returnSpy = spy(origIterator, 'return');
    const schema = buildSchema(origIterator);

    const results = await subscribe({schema, document: query}) as AsyncIterator<ExecutionResult>;
    const end = results.return();

    const r = end.then(res => {
      expect(returnSpy).to.have.been.called;
    });

    pubsub.publish(FIRST_EVENT, {});

    return r;
  });
});

describe('withFilter', () => {

  it('works properly with finite asyncIterators', async () => {
    const isEven = (x: number) => x % 2 === 0;

    const testFiniteAsyncIterator: AsyncIterator<number> = createAsyncIterator([1, 2, 3, 4, 5, 6, 7, 8]);
    // Work around https://github.com/leebyron/iterall/issues/48
    testFiniteAsyncIterator.throw = function (error) {
      return Promise.reject(error);
    };
    testFiniteAsyncIterator.return = function () {
      return Promise.resolve({ value: undefined, done: true });
    };

    const filteredAsyncIterator = withFilter(() => testFiniteAsyncIterator, isEven)();

    for (let i = 1; i <= 4; i++) {
      const result = await filteredAsyncIterator.next();
      expect(result).to.not.be.undefined;
      expect(result.value).to.equal(i * 2);
      expect(result.done).to.be.false;
    }
    const doneResult = await filteredAsyncIterator.next();
    expect(doneResult).to.not.be.undefined;
    expect(doneResult.value).to.be.undefined;
    expect(doneResult.done).to.be.true;
  });

  // Old implementation of with-filter was leaking memory with was visible
  // in case with long lived subscriptions where filter is skipping most of messages
  // https://github.com/apollographql/graphql-subscriptions/issues/212
  it('does not leak memory with promise chain #memory', async function () {
    this.timeout(5000);
    let stopped = false;

    let index = 0;
    const asyncIterator: AsyncIterator<any> = {
      next() {
        if (stopped) {
          return Promise.resolve({done: true, value: undefined});
        }
        index += 1;
        return new Promise(resolve => setImmediate(resolve))
          .then(() => ({done: false, value: index}));
      },
      return() {
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error) {
        return Promise.reject(error);
      },
    };

    const filteredAsyncIterator = withFilter(() => asyncIterator, () => stopped)();

    global.gc();
    const heapUsed = process.memoryUsage().heapUsed;
    const nextPromise = filteredAsyncIterator.next();
    await new Promise(resolve => setTimeout(resolve, 3000));
    global.gc();
    const heapUsed2 = process.memoryUsage().heapUsed;
    stopped = true;
    await nextPromise;

    // Heap memory goes up for less than 1%
    expect(Math.max(0, heapUsed2 - heapUsed) / heapUsed).to.be.lessThan(0.01);
  });

});
