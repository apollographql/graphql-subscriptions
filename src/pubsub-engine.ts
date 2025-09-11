import {PubSubAsyncIterableIterator} from './pubsub-async-iterable-iterator';

export abstract class PubSubEngine<
  Events extends { [event: string]: unknown } = Record<string, never>
> {
  public abstract publish<K extends keyof Events>(triggerName: K, payload: Events[K]): Promise<void>;
  public abstract subscribe<K extends keyof Events>(triggerName: K, onMessage: (payload: Events[K]) => void, options: Object): Promise<number>;
  public abstract unsubscribe(subId: number): void;
  public asyncIterableIterator<K extends keyof Events>(triggers: K | readonly K[]): PubSubAsyncIterableIterator<Events[K]> {
    return new PubSubAsyncIterableIterator<Events[K]>(this as any, triggers as any);
  }
}
