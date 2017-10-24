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

        async publishWithPersistence(triggerName: string, payload: any, collection: string):
            Promise<{ published: boolean, data: any }> {
                const data = await store.save(collection, payload);
                return {
                    data,
                    published: pubSubEngine.publish(triggerName, {...payload, ...data}),
                };
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
