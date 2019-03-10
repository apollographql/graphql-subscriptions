import { $$asyncIterator } from 'iterall';
import { EventEmitter } from 'events';

export function eventEmitterAsyncIterable<T>(eventEmitter: EventEmitter,
                                             eventsNames: string | string[]): AsyncIterableIterator<T> {
  const pullQueue = [];
  const pushQueue = [];
  const eventsArray = typeof eventsNames === 'string' ? [eventsNames] : eventsNames;
  let listening = true;
  let addedListeners = false;

  const pushValue = event => {
    if (pullQueue.length !== 0) {
      pullQueue.shift()({ value: event, done: false });
    } else {
      pushQueue.push(event);
    }
  };

  const pullValue = () => {
    return new Promise(resolve => {
      if (pushQueue.length !== 0) {
        resolve({ value: pushQueue.shift(), done: false });
      } else {
        pullQueue.push(resolve);
      }
    });
  };

  const emptyQueue = () => {
    if (listening) {
      listening = false;
      if (addedListeners) { removeEventListeners(); }
      pullQueue.forEach(resolve => resolve({ value: undefined, done: true }));
      pullQueue.length = 0;
      pushQueue.length = 0;
    }
  };

  const addEventListeners = () => {
    for (const eventName of eventsArray) {
      eventEmitter.addListener(eventName, pushValue);
    }
  };

  const removeEventListeners = () => {
    for (const eventName of eventsArray) {
      eventEmitter.removeListener(eventName, pushValue);
    }
  };

  return {
    next() {
      if (!listening) { return this.return(); }
      if (!addedListeners) {
        addEventListeners();
        addedListeners = true;
      }
      return pullValue();
    },
    return() {
      emptyQueue();

      return Promise.resolve({ value: undefined, done: true });
    },
    throw(error) {
      emptyQueue();

      return Promise.reject(error);
    },
    [$$asyncIterator]() {
      return this;
    },
  } as AsyncIterator<T> as any as AsyncIterableIterator<T>;
  // Asserting as AsyncIterator first so that next, return, and throw are still type checked
}
