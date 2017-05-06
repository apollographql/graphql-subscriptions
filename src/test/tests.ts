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

describe('AsyncIterator', () => {
  it('should expose valid asyncItrator for a specific event', () => {
    const evnetName = 'test';
    const ps = new PubSub();
    const iterator = ps.asyncIterator(evnetName);
    expect(iterator).to.be.defined;
    expect(isAsyncIterable(iterator)).to.be.true;
  });

  it('should trigger event on asyncIterator when published', done => {
    const evnetName = 'test';
    const ps = new PubSub();
    const iterator = ps.asyncIterator(evnetName);

    iterator.next().then(result => {
      expect(result).to.be.defined;
      expect(result.value).to.be.defined;
      expect(result.done).to.be.defined;
      done();
    });

    ps.publish(evnetName, { test: true });
  });

  it('should not trigger event on asyncIterator when publishing other event', () => {
    const evnetName = 'test2';
    const ps = new PubSub();
    const iterator = ps.asyncIterator('test');
    const spy = sinon.spy();

    iterator.next().then(spy);
    ps.publish(evnetName, { test: true });
    expect(spy).not.to.have.been.called;
  });

  it('register to multiple events', done => {
    const evnetName = 'test2';
    const ps = new PubSub();
    const iterator = ps.asyncIterator(['test', 'test2']);
    const spy = sinon.spy();

    iterator.next().then(() => {
      spy();
      expect(spy).to.have.been.called;
      done();
    });
    ps.publish(evnetName, { test: true });
  });

  it('should not trigger event on asyncIterator already returned', done => {
    const evnetName = 'test';
    const ps = new PubSub();
    const iterator = ps.asyncIterator(evnetName);

    iterator.next().then(result => {
      expect(result).to.be.defined;
      expect(result.value).to.be.defined;
      expect(result.done).to.be.false;
    });

    ps.publish(evnetName, { test: true });

    iterator.next().then(result => {
      expect(result).to.be.defined;
      expect(result.value).not.to.be.defined;
      expect(result.done).to.be.true;
      done();
    });

    iterator.return();
    ps.publish(evnetName, { test: true });
  });
});
