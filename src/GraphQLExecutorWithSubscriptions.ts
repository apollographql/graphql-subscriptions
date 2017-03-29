import { execute, OperationDefinitionNode, FieldNode, GraphQLError, validate, DocumentNode, getOperationAST, GraphQLSchema, ExecutionResult, print } from 'graphql';
import { getArgumentValues } from 'graphql/execution/values';
import { PubSubEngine } from './pubsub';
import {
    subscriptionHasSingleRootField,
} from './validation';

export interface TriggerConfig {
    channelOptions?: Object;
    filter?: Function;
}

export interface TriggerMap {
    [triggerName: string]: TriggerConfig;
}

export interface SetupFunction {
    // TODO: Resolve the options typing
    (options: any, args: {[key: string]: any}, subscriptionName: string): TriggerMap;
    //(options: SubscriptionOptions, args: {[key: string]: any}, subscriptionName: string): TriggerMap;
}

export interface SetupFunctions {
    [subscriptionName: string]: SetupFunction;
}

export interface IObservable<T> {
  subscribe(observer: {
    next?: (v: T) => void;
    error?: (e: Error) => void;
    complete?: () => void
  }): { unsubscribe: () => void };
}

export class ValidationError extends Error {
    errors: Array<GraphQLError>;
    message: string;

    constructor(errors){
        super();
        this.errors = errors;
        this.message = 'Subscription query has validation errors';
    }
}

function ObservableOfErrors(errors: Error[]) {
  return {
    subscribe: (observer) => {
      observer.next && observer.next({ errors });
      observer.complete && observer.complete();
      return { unsubscribe: () => {/* noop */} };
    },
  };
}

export class GraphQLExecutorWithSubscriptions {
  private pubsub: PubSubEngine;
  private setupFunctions: SetupFunctions

  constructor(options: { pubsub: PubSubEngine, setupFunctions: SetupFunctions }) {
    this.setupFunctions = options.setupFunctions;
    this.pubsub = options.pubsub;
  }

  public executeReactive(
    schema: GraphQLSchema,
    document: DocumentNode,
    rootValue?: any,
    contextValue?: any,
    variableValues?: {[key: string]: any},
    operationName?: string,
  ) {
    const errors = validate(schema, document);
    if ( errors.length > 0 ) {
      return ObservableOfErrors([new ValidationError(errors)]);
    }

    const operationAST = getOperationAST(document, operationName);
    if ( null === operationAST ) {
      return ObservableOfErrors([new Error(`could not parse operation on query`)]);
    }

    if ( operationAST.operation === 'subscription' ) {
      return this.handleSubscription(schema, document, rootValue, contextValue, variableValues, operationName);
    } else {
      return this.handleStatic(schema, document, rootValue, contextValue, variableValues, operationName);
    }
  }

  public execute(
    schema: GraphQLSchema,
    document: DocumentNode,
    rootValue?: any,
    contextValue?: any,
    variableValues?: {[key: string]: any},
    operationName?: string,
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const sub = this.executeReactive(schema, document, rootValue, contextValue, variableValues, operationName)
        .subscribe({
          next: (v) => {
            resolve(v)
            process.nextTick(() => sub.unsubscribe());
          },
          error: (e) => reject(e),
          complete: () => { /* noop */ },
        });
    });
  }

  protected handleSubscription(
    schema: GraphQLSchema,
    document: DocumentNode,
    rootValue?: any,
    contextValue?: any,
    variableValues?: {[key: string]: any},
    operationName?: string,
  ): IObservable<ExecutionResult> {
    // 1. validate the query, operationName and variables
    const errors = validate(
      schema,
      document,
      [subscriptionHasSingleRootField],
    );

    // TODO: validate that all variables have been passed (and are of correct type)?
    if (errors.length){
      // this error kills the subscription, so we throw it.
      return ObservableOfErrors([new ValidationError(errors)]);
    }

    let args = {};

    // operationName is the name of the only root field in the subscription document
    const definition = getOperationAST(document, operationName);
    let subscriptionName = '';

    // only one root field is allowed on subscription. No fragments for now.
    const rootField = (definition as OperationDefinitionNode).selectionSet.selections[0] as FieldNode;
    subscriptionName = rootField.name.value;

    const fields = schema.getSubscriptionType().getFields();
    args = getArgumentValues(fields[subscriptionName], rootField, variableValues);

    let triggerMap: TriggerMap;

    if (this.setupFunctions[subscriptionName]) {
        triggerMap = this.setupFunctions[subscriptionName]({
          query: print(document),
          operationName,
          variables: variableValues,
          contextValue,
        }, args, subscriptionName);
    } else {
        // if not provided, the triggerName will be the subscriptionName, The trigger will not have any
        // options and rely on defaults that are set later.
        triggerMap = {[subscriptionName]: {}};
    }

    return {
      subscribe: (observer) => {
        const subscriptionPromises: Promise<number>[] = Object.keys(triggerMap).map( triggerName => {
            // Deconstruct the trigger options and set any defaults
            const {
                channelOptions = {},
                filter = () => true, // Let all messages through by default.
            } = triggerMap[triggerName];

            // 2. generate the handler function
            //
            // rootValue is the payload sent by the event emitter / trigger by
            // convention this is the value returned from the mutation
            // resolver
            const onMessage = (rootValue) => {
                return Promise.resolve().then(() => {
                    if (typeof contextValue === 'function') {
                        return (<Function>contextValue)();
                    }
                    return contextValue;
                }).then((curContext) => {
                    return Promise.all([
                        curContext,
                        filter(rootValue, curContext),
                    ]);
                }).then(([curContext, doExecute]) => {
                  if (!doExecute) {
                    return;
                  }
                  execute(
                      schema,
                      document,
                      rootValue,
                      curContext,
                      variableValues,
                      operationName
                  ).then( data => observer.next(data) );
                }).catch((error) => {
                    observer.error(error);
                    observer.complete();
                });
            }

            // 3. subscribe and keep the subscription id
            return this.pubsub.subscribe(triggerName, onMessage, channelOptions);
        });

        return {
          unsubscribe: () => {
            // Unsubscribe all pubsubs.
            return Promise.all(subscriptionPromises).then((subIds) => {
              subIds.forEach((id) => this.pubsub.unsubscribe(id));
            });
          },
        };
      },
    };
  }

  protected handleStatic(
    schema: GraphQLSchema,
    document: DocumentNode,
    rootValue?: any,
    contextValue?: any,
    variableValues?: {[key: string]: any},
    operationName?: string,
  ): IObservable<ExecutionResult> {
    return {
        subscribe: (observer) => {
          Promise.resolve(undefined).then(() => execute(schema, document, rootValue, contextValue, variableValues, operationName))
          .then((value) => {
            observer.next(value);
            observer.complete();
          }, (e) => {
            observer.error(e);
            observer.complete();
          });

          return { unsubscribe: () => {/* noop */} };
      },
    };
  }
}
