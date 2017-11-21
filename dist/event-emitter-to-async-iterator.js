"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var iterall_1 = require("iterall");
function eventEmitterAsyncIterator(eventEmitter, eventsNames) {
    var pullQueue = [];
    var pushQueue = [];
    var eventsArray = typeof eventsNames === 'string' ? [eventsNames] : eventsNames;
    var listening = true;
    var pushValue = function (event) {
        if (pullQueue.length !== 0) {
            pullQueue.shift()({ value: event, done: false });
        }
        else {
            pushQueue.push(event);
        }
    };
    var pullValue = function () {
        return new Promise(function (resolve) {
            if (pushQueue.length !== 0) {
                resolve({ value: pushQueue.shift(), done: false });
            }
            else {
                pullQueue.push(resolve);
            }
        });
    };
    var emptyQueue = function () {
        if (listening) {
            listening = false;
            removeEventListeners();
            pullQueue.forEach(function (resolve) { return resolve({ value: undefined, done: true }); });
            pullQueue.length = 0;
            pushQueue.length = 0;
        }
    };
    var addEventListeners = function () {
        for (var _i = 0, eventsArray_1 = eventsArray; _i < eventsArray_1.length; _i++) {
            var eventName = eventsArray_1[_i];
            eventEmitter.addListener(eventName, pushValue);
        }
    };
    var removeEventListeners = function () {
        for (var _i = 0, eventsArray_2 = eventsArray; _i < eventsArray_2.length; _i++) {
            var eventName = eventsArray_2[_i];
            eventEmitter.removeListener(eventName, pushValue);
        }
    };
    addEventListeners();
    return _a = {
            next: function () {
                return listening ? pullValue() : this.return();
            },
            return: function () {
                emptyQueue();
                return Promise.resolve({ value: undefined, done: true });
            },
            throw: function (error) {
                emptyQueue();
                return Promise.reject(error);
            }
        },
        _a[iterall_1.$$asyncIterator] = function () {
            return this;
        },
        _a;
    var _a;
}
exports.eventEmitterAsyncIterator = eventEmitterAsyncIterator;
//# sourceMappingURL=event-emitter-to-async-iterator.js.map