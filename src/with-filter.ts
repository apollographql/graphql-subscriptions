import { $$asyncIterator } from 'iterall';

export type FilterFn = (rootValue?: any, args?: any, context?: any, info?: any) => boolean;
export type ResolverFn = (rootValue?: any, args?: any, context?: any, info?: any) => AsyncIterator<any>;

export const withFilter = (asyncIteratorFn: () => AsyncIterator<any>, filterFn: FilterFn): Function => {
  return (rootValue: any, args: any, context: any, info: any): AsyncIterator<any> => {
    const asyncIterator = asyncIteratorFn();

    const getNextPromise = () => {
      return asyncIterator
        .next()
        .then(payload => Promise.all([
          payload,
          Promise.resolve(filterFn(payload.value, args, context, info)).catch(() => false),
        ]))
        .then(([payload, filterResult]) => {
          if (filterResult === true) {
            return payload;
          }

          // Skip the current value and wait for the next one
          return getNextPromise();
        });
    };

    return {
      next() {
        return getNextPromise();
      },
      return() {
        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error) {
        return Promise.reject(error);
      },
      [$$asyncIterator]() {
        return this;
      },
    };
  };
};
