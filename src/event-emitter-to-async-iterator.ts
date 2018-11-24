import { EventEmitter } from 'events';

export async function* eventEmitterAsyncIterator<T>(
  emitter: EventEmitter,
  event: string | string[]
): AsyncIterator<T> {
  let q = [];
  const events = [].concat(event);
  events.forEach(e => emitter.on(e, arg => q.push(arg)));
  while (true) {
    await Promise.race(events.map(e => new Promise(rs => emitter.once(e, rs))));
    while (q.length) {
      yield q.shift();
    }
  }
}
