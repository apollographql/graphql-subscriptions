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


    const results = await subscribe(schema, query) as AsyncIterator<ExecutionResult>;
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

    const results = await subscribe(schema, query) as AsyncIterator<ExecutionResult>;
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

    subscribe(schema, query).then((resultsIn) => {
      expect(isAsyncIterable(resultsIn)).to.be.true;
      const results = resultsIn as AsyncIterator<ExecutionResult>;

      results.next();
      results.return();

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

    const results = await subscribe(schema, query) as AsyncIterator<ExecutionResult>;
    const end = results.return();

    const r = end.then(res => {
      expect(returnSpy).to.have.been.called;
    });

    pubsub.publish(FIRST_EVENT, {});

    return r;
  });
});

function isEven(x: number) {
  if (x === undefined) {
    throw Error('Undefined value passed to filterFn');
  }
  return x % 2 === 0;
}

let testFiniteAsyncIterator: AsyncIterator<number> = createAsyncIterator([1, 2, 3, 4, 5, 6, 7, 8]);
// Work around https://github.com/leebyron/iterall/issues/48
(testFiniteAsyncIterator as any).throw = function (error) {
  return Promise.reject(error);
};
(testFiniteAsyncIterator as any).return = function () {
  return { value: undefined, done: true };
};

describe('withFilter', () => {
  it('works properly with finite asyncIterators', async () => {
    let filteredAsyncIterator = withFilter(() => testFiniteAsyncIterator, isEven)();

    for (let i = 1; i <= 4; i++) {
      let result = await filteredAsyncIterator.next();
      expect(result).to.not.be.undefined;
      expect(result.value).to.equal(i * 2);
      expect(result.done).to.be.false;
    }
    let doneResult = await filteredAsyncIterator.next();
    expect(doneResult).to.not.be.undefined;
    expect(doneResult.value).to.be.undefined;
    expect(doneResult.done).to.be.true;
  });
});
