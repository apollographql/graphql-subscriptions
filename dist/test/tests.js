"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var sinon = require("sinon");
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
var sinonChai = require("sinon-chai");
var pubsub_1 = require("../pubsub");
var iterall_1 = require("iterall");
chai.use(chaiAsPromised);
chai.use(sinonChai);
var expect = chai.expect;
var assert = chai.assert;
describe('PubSub', function () {
    it('can subscribe and is called when events happen', function (done) {
        var ps = new pubsub_1.PubSub();
        ps.subscribe('a', function (payload) {
            expect(payload).to.equals('test');
            done();
        }).then(function () {
            var succeed = ps.publish('a', 'test');
            expect(succeed).to.be.true;
        });
    });
    it('can unsubscribe', function (done) {
        var ps = new pubsub_1.PubSub();
        ps.subscribe('a', function (payload) {
            assert(false);
        }).then(function (subId) {
            ps.unsubscribe(subId);
            var succeed = ps.publish('a', 'test');
            expect(succeed).to.be.true;
            done();
        });
    });
});
describe('AsyncIterator', function () {
    it('should expose valid asyncItrator for a specific event', function () {
        var evnetName = 'test';
        var ps = new pubsub_1.PubSub();
        var iterator = ps.asyncIterator(evnetName);
        expect(iterator).to.not.be.undefined;
        expect(iterall_1.isAsyncIterable(iterator)).to.be.true;
    });
    it('should trigger event on asyncIterator when published', function (done) {
        var evnetName = 'test';
        var ps = new pubsub_1.PubSub();
        var iterator = ps.asyncIterator(evnetName);
        iterator.next().then(function (result) {
            expect(result).to.not.be.undefined;
            expect(result.value).to.not.be.undefined;
            expect(result.done).to.not.be.undefined;
            done();
        });
        ps.publish(evnetName, { test: true });
    });
    it('should not trigger event on asyncIterator when publishing other event', function () {
        var evnetName = 'test2';
        var ps = new pubsub_1.PubSub();
        var iterator = ps.asyncIterator('test');
        var spy = sinon.spy();
        iterator.next().then(spy);
        ps.publish(evnetName, { test: true });
        expect(spy).not.to.have.been.called;
    });
    it('register to multiple events', function (done) {
        var evnetName = 'test2';
        var ps = new pubsub_1.PubSub();
        var iterator = ps.asyncIterator(['test', 'test2']);
        var spy = sinon.spy();
        iterator.next().then(function () {
            spy();
            expect(spy).to.have.been.called;
            done();
        });
        ps.publish(evnetName, { test: true });
    });
    it('should not trigger event on asyncIterator already returned', function (done) {
        var evnetName = 'test';
        var ps = new pubsub_1.PubSub();
        var iterator = ps.asyncIterator(evnetName);
        iterator.next().then(function (result) {
            expect(result).to.not.be.undefined;
            expect(result.value).to.not.be.undefined;
            expect(result.done).to.be.false;
        });
        ps.publish(evnetName, { test: true });
        iterator.next().then(function (result) {
            expect(result).to.not.be.undefined;
            expect(result.value).to.be.undefined;
            expect(result.done).to.be.true;
            done();
        });
        iterator.return();
        ps.publish(evnetName, { test: true });
    });
});
//# sourceMappingURL=tests.js.map