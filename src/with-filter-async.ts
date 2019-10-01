import { withFilter, FilterFn } from '.';

export type ResolverFnAsync = (rootValue?: any, args?: any, context?: any, info?: any) => Promise<AsyncIterator<any>>;

export const withFilterAsync = (asyncIteratorFn: ResolverFnAsync, filterFn: FilterFn): ResolverFnAsync => {
  return async (rootValue: any, args: any, context: any, info: any): Promise<AsyncIterator<any>> => {
    const asyncIterator = await asyncIteratorFn(rootValue, args, context, info);
    return withFilter(() => asyncIterator, filterFn)();
  };
};

