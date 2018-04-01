import { $$asyncIterator } from 'iterall';
import { EventEmitter } from 'events';

import { eventEmitterAsyncIterator } from './event-emitter-to-async-iterator';

export function eventEmitterAsyncIterable<T>(eventEmitter: EventEmitter,
                                             eventsNames: string | string[]): AsyncIterator<T> {
  return {
    [$$asyncIterator]() {
      return eventEmitterAsyncIterator(eventEmitter, eventsNames);
    },
  };
}
