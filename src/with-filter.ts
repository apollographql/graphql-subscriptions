import { $$asyncIterator } from 'iterall';

export type FilterFn<TSource = any, TArgs = any, TContext = any> = (rootValue?: TSource, args?: TArgs, context?: TContext, info?: any) => boolean | Promise<boolean>;
export type ResolverFn<TSource = any, TArgs = any, TContext = any> = (rootValue?: TSource, args?: TArgs, context?: TContext, info?: any) => AsyncIterator<any>;

interface IterallAsyncIterator<T> extends AsyncIterator<T> {
  [$$asyncIterator](): IterallAsyncIterator<T>;
}

export type WithFilter<TSource = any, TArgs = any, TContext = any> = (
  asyncIteratorFn: ResolverFn<TSource, TArgs, TContext>,
  filterFn: FilterFn<TSource, TArgs, TContext>
) => ResolverFn<TSource, TArgs, TContext>;

export function withFilter<TSource = any, TArgs = any, TContext = any>(
  asyncIteratorFn: ResolverFn<TSource, TArgs, TContext>,
  filterFn: FilterFn<TSource, TArgs, TContext>
): ResolverFn<TSource, TArgs, TContext> {
  return (rootValue: TSource, args: TArgs, context: TContext, info: any): IterallAsyncIterator<any> => {
    const asyncIterator = asyncIteratorFn(rootValue, args, context, info);

    const getNextPromise = () => {
      return new Promise<IteratorResult<any>>((resolve, reject) => {

        const inner = () => {
          asyncIterator
            .next()
            .then(payload => {
              if (payload.done === true) {
                resolve(payload);
                return;
              }
              Promise.resolve(filterFn(payload.value, args, context, info))
                .catch(() => false) // We ignore errors from filter function
                .then(filterResult => {
                  if (filterResult === true) {
                    resolve(payload);
                    return;
                  }
                  // Skip the current value and wait for the next one
                  inner();
                  return;
                });
            })
            .catch((err) => {
              reject(err);
              return;
            });
        };

        inner();

      });
    };

    const asyncIterator2 = {
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
    };

    return asyncIterator2;
  };
};
