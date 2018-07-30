import { EventEmitter } from 'events';
import { PubSubEngine } from './pubsub-engine';
import { eventEmitterAsyncIterator } from './event-emitter-to-async-iterator';

export interface PubSubOptions {
  eventEmitter?: EventEmitter;
}

export class PubSub implements PubSubEngine {
  protected ee: EventEmitter;
  private subscriptions: { [key: string]: [string, (...args: any[]) => void] };
  private subIdCounter: number;

  constructor(options: PubSubOptions = {}) {
    this.ee = options.eventEmitter || new EventEmitter();
    this.subscriptions = {};
    this.subIdCounter = 0;
  }

  public publish(triggerName: string, payload: any): Promise<void> {
    this.ee.emit(triggerName, payload);
    return Promise.resolve();
  }

  public subscribe(triggerName: string, onMessage: (...args: any[]) => void): Promise<number> {
    this.ee.addListener(triggerName, onMessage);
    this.subIdCounter = this.subIdCounter + 1;
    this.subscriptions[this.subIdCounter] = [triggerName, onMessage];

    return Promise.resolve(this.subIdCounter);
  }

  public unsubscribe(subId: number) {
    const [triggerName, onMessage] = this.subscriptions[subId];
    delete this.subscriptions[subId];
    this.ee.removeListener(triggerName, onMessage);
  }

  public asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
    return eventEmitterAsyncIterator<T>(this.ee, triggers);
  }
}
