//
// This is basically just event emitters wrapped with a function that filters messages.
//
import { EventEmitter } from 'events';

export interface PubSubEngine {
  publish(triggerName: string, payload: any): boolean;
  subscribe(triggerName: string, onMessage: Function, options: Object): Promise<number>;
  unsubscribe(subId: number);
}

export class PubSub implements PubSubEngine {
    private ee: EventEmitter;
    private subscriptions: {[key: string]: [string, Function]};
    private subIdCounter: number;

    constructor() {
        this.ee = new EventEmitter(); // max listeners = 10.
        this.subscriptions = {};
        this.subIdCounter = 0;
    }

    public publish(triggerName: string, payload: any): boolean {
        process.nextTick(() => this.ee.emit(triggerName, payload));
        // Not using the value returned from emit method because it gives
        // irrelevant false when there are no listeners.
        return true;
    }

    public subscribe(triggerName: string, onMessage: Function, options: Object): Promise<number> {
        // XXX: channelOptions was not defined or used here, yet in the interface.

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
}
