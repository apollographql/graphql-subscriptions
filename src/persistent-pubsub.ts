import {
    PubSubEngine,
    PersistenceClient,
    PersistenceAsyncOptions,
    persistenceAsyncIterator,
} from './index';

export const createPersistentPubSub = (
    store: PersistenceClient,
    pubSubEngine: PubSubEngine,
) => {
    return {
        publish: (triggerName: string, payload: any) =>
            pubSubEngine.publish(triggerName, payload),

        asyncIterator: <T>(triggers: string | string[]): AsyncIterator<T> =>
            pubSubEngine.asyncIterator(triggers),

        publishWithPersistence(triggerName: string, payload: any, collection: string): boolean {
            store.save(collection, payload);
            return pubSubEngine.publish(triggerName, payload);
        },
        subscribe(triggerName: string, onMessage: Function, options: Object): Promise<number> {
            return pubSubEngine.subscribe(triggerName, onMessage, options);
        },
        unsubscribe(subId: number) {
            return pubSubEngine.unsubscribe(subId);
        },
        asyncIteratorWithPersistence<T>(triggers: string | string[],
                      options: PersistenceAsyncOptions): AsyncIterator<T> {
            return persistenceAsyncIterator(
                store,
                options,
                pubSubEngine.asyncIterator(triggers),
            );
        },
    };
};
