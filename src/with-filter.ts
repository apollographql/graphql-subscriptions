import { $$asyncIterator, getAsyncIterator } from 'iterall';

export type FilterFn = (rootValue?: any, args?: any, context?: any, info?: any) => boolean | Promise<boolean>;
export type ResolverFn = (rootValue?: any, args?: any, context?: any, info?: any) => AsyncIterable<any>;

export const withFilter = (asyncIterableFn: ResolverFn, filterFn: FilterFn): ResolverFn => {
  return (rootValue: any, args: any, context: any, info: any): AsyncIterable<any> => {
    const asyncIterable = asyncIterableFn(rootValue, args, context, info);

    // @ts-ignore: $$asyncIterator is considered the same as Symbol.asyncIterator by TypeScript
    return {
      [$$asyncIterator]() {
        const asyncIterator = getAsyncIterator(asyncIterable);

        const getNextPromise = () => {
          return asyncIterator
            .next()
            .then(payload => Promise.all([
              payload,
              Promise.resolve(filterFn(payload.value, args, context, info)).catch(() => false),
            ]))
            .then(([payload, filterResult]) => {
              if (filterResult === true || payload.done === true) {
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
            return asyncIterator.return();
          },
          throw(error) {
            return asyncIterator.throw(error);
          },
        };
      },
    };
  };
};
