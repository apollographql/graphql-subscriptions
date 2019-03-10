import { $$asyncIterator, getAsyncIterator } from 'iterall';

export type FilterFn = (rootValue?: any, args?: any, context?: any, info?: any) => boolean | Promise<boolean>;
export type ResolverFn = (rootValue?: any, args?: any, context?: any, info?: any) => AsyncIterable<any>;

export const withFilter = (asyncIterableFn: ResolverFn, filterFn: FilterFn): ResolverFn => {
  return (rootValue: any, args: any, context: any, info: any): AsyncIterableIterator<any> => {
    const asyncIterable = asyncIterableFn(rootValue, args, context, info);
    const asyncIterator = getAsyncIterator(asyncIterable);

    const getNextPromise = () => {
      return asyncIterator
        .next()
        .then(payload => {
          if (payload.done === true) {
            return payload;
          }

          return Promise.resolve(filterFn(payload.value, args, context, info))
            .catch(() => false)
            .then(filterResult => {
              if (filterResult === true) {
                return payload;
              }

              // Skip the current value and wait for the next one
              return getNextPromise();
            });
        });
    };

    return {
      next() {
        return getNextPromise();
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
    } as AsyncIterator<any> as any as AsyncIterableIterator<any>;
    // Asserting as AsyncIterator first so that next, return, and throw are still type checked
  };
};
