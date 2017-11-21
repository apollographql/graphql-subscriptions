/// <reference types="node" />
import { EventEmitter } from 'events';
import { PubSubEngine } from './pubsub-engine';
export declare class PubSub implements PubSubEngine {
    protected ee: EventEmitter;
    private subscriptions;
    private subIdCounter;
    constructor();
    publish(triggerName: string, payload: any): boolean;
    subscribe(triggerName: string, onMessage: (...args: any[]) => void): Promise<number>;
    unsubscribe(subId: number): void;
    asyncIterator<T>(triggers: string | string[]): AsyncIterator<T>;
}
