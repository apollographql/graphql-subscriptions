// chai style expect().to.be.true  violates no-unused-expression
/* tslint:disable:no-unused-expression */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { spy } from 'sinon';
import * as sinonChai from 'sinon-chai';

import { isAsyncIterable } from 'iterall';
import { PubSub } from '../pubsub';
import { withFilter } from '../with-filter';

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

function buildSchema(iterator) {
  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        testString: {
          type: GraphQLString,
          resolve: function(_, args) {
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
          subscribe: withFilter(
            () => iterator,
            () => true,
          ),
          resolve: root => {
            return 'FIRST_EVENT';
          },
        },
      },
    }),
  });
}


describe('GraphQL-JS asyncIterator', () => {
  it('should allow subscriptions', () => {
    const query = parse(`
      subscription S1 {
        testSubscription
      }
    `);

    const pubsub = new PubSub();
    const origIterator = pubsub.asyncIterator(FIRST_EVENT);
    const schema = buildSchema(origIterator);

    const results = subscribe(schema, query);
    const payload1 = results.next();

    expect(isAsyncIterable(results)).to.be.true;

    const r = payload1.then(res => {
      expect(res.value.data.testSubscription).to.equal('FIRST_EVENT');
    });

    pubsub.publish(FIRST_EVENT, {});

    return r;
  });

  it('should clear event handlers', () => {
    const query = parse(`
      subscription S1 {
        testSubscription
      }
    `);

    const pubsub = new PubSub();
    const origIterator = pubsub.asyncIterator(FIRST_EVENT);
    const returnSpy = spy(origIterator, 'return');
    const schema = buildSchema(origIterator);

    const results = subscribe(schema, query);
    const end = results.return();

    const r = end.then(res => {
      expect(returnSpy).to.have.been.called;
    });

    pubsub.publish(FIRST_EVENT, {});

    return r;
  });
});
