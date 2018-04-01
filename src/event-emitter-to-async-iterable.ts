import { $$asyncIterator } from 'iterall';
import { EventEmitter } from 'events';

import { eventEmitterAsyncIterator } from './event-emitter-to-async-iterator';

export function eventEmitterAsyncIterable<T>(eventEmitter: EventEmitter,
                                             eventsNames: string | string[]): AsyncIterable<T> {
  // @ts-ignore: $$asyncIterator is considered the same as Symbol.asyncIterator by TypeScript
  return {
    [$$asyncIterator]() {
      return eventEmitterAsyncIterator(eventEmitter, eventsNames);
    },
  };
}
