export interface PubSubEngine {
    publish(triggerName: string, payload: any): boolean;
    subscribe(triggerName: string, onMessage: Function, options: Object): Promise<number>;
    unsubscribe(subId: number): any;
    asyncIterator<T>(triggers: string | string[]): AsyncIterator<T>;
}
