// chai style expect().to.be.true violates no-unused-expression
/* tslint:disable:no-unused-expression */

import * as sinon from 'sinon';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinonChai from 'sinon-chai';

import { PubSub } from '../pubsub';
import { isAsyncIterable } from 'iterall';

chai.use(chaiAsPromised);
chai.use(sinonChai);
const expect = chai.expect;
const assert = chai.assert;

describe('PubSub', function() {
  it('can subscribe and is called when events happen', () => {
    const ps = new PubSub();
    return ps.subscribe('a', payload => {
      expect(payload).to.equals('test');
    }).then(() => {
      return ps.publish('a', 'test');
    });
  });

  it('can unsubscribe', async () => {
    const ps = new PubSub();
    let subId = await ps.subscribe('a', payload => { assert(false); });
    ps.unsubscribe(subId);
    let succeed = await ps.publish('a', 'test');
    expect(succeed).to.be.undefined;
  });
});

describe('AsyncIterator', () => {
  it('should expose valid asyncIterator for a specific event', () => {
    const eventName = 'test';
    const ps = new PubSub();
    const iterator = ps.asyncIterator(eventName);
    expect(iterator).to.not.be.undefined;
    expect(isAsyncIterable(iterator)).to.be.true;
  });

  it('should trigger event on asyncIterator when published', done => {
    const eventName = 'test';
    const ps = new PubSub();
    const iterator = ps.asyncIterator(eventName);

    iterator.next().then(result => {
      expect(result).to.not.be.undefined;
      expect(result.value).to.not.be.undefined;
      expect(result.done).to.not.be.undefined;
      done();
    });

    ps.publish(eventName, { test: true });
  });

  it('should not trigger event on asyncIterator when publishing other event', () => {
    const eventName = 'test2';
    const ps = new PubSub();
    const iterator = ps.asyncIterator('test');
    const spy = sinon.spy();

    iterator.next().then(spy);
    ps.publish(eventName, { test: true });
    expect(spy).not.to.have.been.called;
  });

  it('register to multiple events', done => {
    const eventName = 'test2';
    const ps = new PubSub();
    const iterator = ps.asyncIterator(['test', 'test2']);
    const spy = sinon.spy();

    iterator.next().then(() => {
      spy();
      expect(spy).to.have.been.called;
      done();
    });
    ps.publish(eventName, { test: true });
  });

  it('should not trigger event on asyncIterator already returned', done => {
    const eventName = 'test';
    const ps = new PubSub();
    const iterator = ps.asyncIterator(eventName);

    iterator.next().then(result => {
      expect(result).to.deep.equal({
        value: undefined,
        done: true,
      });
    }).catch(done);

    ps.publish(eventName, { test: true });

    iterator.next().then(result => {
      expect(result).to.deep.equal({
        value: undefined,
        done: true,
      });
      done();
    }).catch(done);

    iterator.return();

    ps.publish(eventName, { test: true });
  });

  it('should not register event listeners before next() is called', () => {
    const testEventName = 'test';
    class TestPubSub extends PubSub {
      public listenerCount(eventName: string): number {
        return this.ee.listenerCount(eventName);
      }
    }
    const ps = new TestPubSub();
    ps.asyncIterator(testEventName);

    expect(ps.listenerCount(testEventName)).to.equal(0);
  });
});
