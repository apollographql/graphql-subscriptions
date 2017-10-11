import { $$asyncIterator } from 'iterall';

export type SequenceFieldType = string;

export interface EventItem {
    seq: SequenceFieldType;
    payload: any;
}

export interface PersistenceClient {
    fetchNext: (collection: string, fromSeq: SequenceFieldType, batchSize: number) => Promise<[EventItem]>;
    save: (collection: string, item: Object) => Promise<any>;
}

export interface PersistenceAsyncOptions {
    lastSequence: SequenceFieldType;
    collection: string;
    batchSize: number;
}

export const persistenceAsyncIterator = <T>(
    store: PersistenceClient,
    options: PersistenceAsyncOptions,
    afterAsyncIterator: AsyncIterator<any>,
): AsyncIterator<T> =>  {
    const asyncIterator = afterAsyncIterator;

    let hasPersistence = true;
    let data: Array<EventItem> = [];
    let cursor = options.lastSequence;

    const extractItem = (resolve) => {
        const item = data.shift();
        cursor = item.seq;
        // console.log('resolve item', `cursor: ${cursor}`, item.payload);
        resolve({
            done: false,
            value: item.payload,
        });
    };
    const fetchData = (resolve) => {
        store.fetchNext(options.collection, cursor, options.batchSize)
            .then((result) => {
                data = result;
                if (data.length === 0) {
                    // console.log('NO DATA MORE');
                    hasPersistence = false;
                    resolve(asyncIterator.next());
                } else {
                    extractItem(resolve);
                }
            });
    };

    return {
        next() {
            return new Promise((resolve) => {
                if (hasPersistence) {
                    data.length === 0 ? fetchData(resolve) : extractItem(resolve);
                } else {
                    resolve(asyncIterator.next());
                }
            });
        },
        return() {
            return asyncIterator.return();
        },
        throw(error) {
            return asyncIterator.throw(error);
        },
        [$$asyncIterator]() {
            return this;
        },
    };
};
