export interface PubSubEngine {
  publish(triggerName: string, payload: any): Promise<void>;
  subscribe(triggerName: string, onMessage: Function, options: Object): Promise<number>;
  unsubscribe(subId: number);
  asyncIterator<T>(triggers: string | string[]): AsyncIterator<T>;
}
