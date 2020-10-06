import {PubSubAsyncIterableIterator} from './pubsub-async-iterable-iterator';

export abstract class PubSubEngine {
  public abstract publish(triggerName: string, payload: any): Promise<void>;
  public abstract subscribe(triggerName: string, onMessage: Function, options: Object): Promise<number>;
  public abstract unsubscribe(subId: number);
  public asyncIterableIterator<T>(triggers: string | readonly string[]): PubSubAsyncIterableIterator<T> {
    return new PubSubAsyncIterableIterator<T>(this, triggers);
  }
}
