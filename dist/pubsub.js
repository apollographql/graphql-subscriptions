"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var events_1 = require("events");
var event_emitter_to_async_iterator_1 = require("./event-emitter-to-async-iterator");
var PubSub = (function () {
    function PubSub() {
        this.ee = new events_1.EventEmitter();
        this.subscriptions = {};
        this.subIdCounter = 0;
    }
    PubSub.prototype.publish = function (triggerName, payload) {
        this.ee.emit(triggerName, payload);
        return true;
    };
    PubSub.prototype.subscribe = function (triggerName, onMessage) {
        this.ee.addListener(triggerName, onMessage);
        this.subIdCounter = this.subIdCounter + 1;
        this.subscriptions[this.subIdCounter] = [triggerName, onMessage];
        return Promise.resolve(this.subIdCounter);
    };
    PubSub.prototype.unsubscribe = function (subId) {
        var _a = this.subscriptions[subId], triggerName = _a[0], onMessage = _a[1];
        delete this.subscriptions[subId];
        this.ee.removeListener(triggerName, onMessage);
    };
    PubSub.prototype.asyncIterator = function (triggers) {
        return event_emitter_to_async_iterator_1.eventEmitterAsyncIterator(this.ee, triggers);
    };
    return PubSub;
}());
exports.PubSub = PubSub;
//# sourceMappingURL=pubsub.js.map