import { EventEmitter } from 'events';

export async function* eventEmitterAsyncIterator<T>(
  emitter: EventEmitter,
  events: string | string[]
): AsyncIterator<T> {
  let q = [];
  const eventsArray = [].concat(events);
  for (let event of eventsArray) emitter.on(event,arg => q.push(arg));
  while (true) {
    await new Promise(rs=>setImmediate(rs));
    while (q.length) {
      yield q.shift();
    }
  }
}
