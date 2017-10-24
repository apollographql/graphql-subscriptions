import { $$asyncIterator } from 'iterall';

export type SequenceFieldType = string;

export interface EventItem {
    seq: SequenceFieldType;
}

export interface FetchNextParams {
    collection: string;
    fromSeq: SequenceFieldType;
    batchSize: number;
    queryFilter: any;
}

export interface PersistenceClient {
    fetchNext: (params: FetchNextParams) => Promise<[EventItem]>;
    save: (collection: string, item: Object) => Promise<any>;
}

export interface PersistenceAsyncOptions {
    lastSequence: SequenceFieldType;
    collection: string;
    batchSize: number;
    publishDelay: number;
    queryFilter?: any;
}

export const persistenceAsyncIterator = <T>(
    store: PersistenceClient,
    options: PersistenceAsyncOptions,
    asyncIterator: AsyncIterator<any>,
): AsyncIterator<T> =>  {
    let hasPersistence = true;
    let data: Array<EventItem> = [];
    let cursor = options.lastSequence;

    const extractItem = (): Promise<IteratorResult<EventItem>> => new Promise((resolve) => {
            const item = data.shift();
            cursor = item.seq;
            console.log('resolve item', `cursor: ${cursor}`);

            if (options.publishDelay) {
                setTimeout(() => {
                    resolve({
                        done: false,
                        value: item,
                    });
                }, options.publishDelay);
            } else {
                resolve({
                    done: false,
                    value: item,
                });
            }
        });

    const fetchData = (): Promise<[EventItem]> =>
        store.fetchNext({
            queryFilter: options.queryFilter || {},
            collection: options.collection,
            batchSize: options.batchSize || 10,
            fromSeq: cursor,
        });

    return {
        next() {
            if (hasPersistence) {
                // try to fetch new data
                if (data.length === 0) {
                    return fetchData().then((result) => {
                        // new data
                        if (result.length !== 0) {
                            data = result;
                            return extractItem();
                        }
                        // no more data
                        hasPersistence = false;
                        return asyncIterator.next();
                    });
                } else {
                    return extractItem();
                }
            }

            return asyncIterator.next();
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
