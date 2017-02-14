import { GraphQLExecutorWithSubscriptions } from './GraphQLExecutorWithSubscriptions';
import { GraphQLSchema, validate, specifiedRules, parse} from 'graphql';
import { SetupFunctions, ValidationError } from './GraphQLExecutorWithSubscriptions';
import { Subscription } from 'graphql-server-reactive-core';
import { PubSubEngine } from './pubsub';

export interface SubscriptionOptions {
    query: string;
    operationName: string;
    callback: Function;
    variables?: { [key: string]: any };
    context?: any;
    formatError?: Function;
    formatResponse?: Function;
};

// This manages actual GraphQL subscriptions.
export class SubscriptionManager {
    private schema: GraphQLSchema;
    private executor: GraphQLExecutorWithSubscriptions;
    private subscriptions: { [externalId: number]: Subscription };
    private maxSubscriptionId: number;

    constructor(options: {  schema: GraphQLSchema,
                            setupFunctions: SetupFunctions,
                            pubsub: PubSubEngine }){
        this.executor = new GraphQLExecutorWithSubscriptions({
          pubsub: options.pubsub,
          setupFunctions: options.setupFunctions,
        });
        this.schema = options.schema;
        this.subscriptions = {};
        this.maxSubscriptionId = 0;
    }

    public subscribe(options: SubscriptionOptions): Promise<number> {
        const document = parse(options.query);
        const errors = validate(
            this.schema,
            document,
            specifiedRules,
        );

        if (errors.length){
            // this error kills the subscription, so we throw it.
            return Promise.reject<number>(new ValidationError(errors));
        }

        const args = {};
        const externalSubscriptionId = this.maxSubscriptionId++;
        const resultObservable = this.executor.executeReactive(
          this.schema,
          document,
          undefined,
          options.context,
          options.variables,
          options.operationName
        );

        this.subscriptions[externalSubscriptionId] = resultObservable.subscribe({
          next: (v) => options.callback(undefined, v),
          error: (e) => options.callback(e, undefined),
          // XXX: Old subscription manager behavior was not to clean for the user,
          // and error on double clear. do we want to fix it?
          // complete: () => this.unsubscribe(externalSubscriptionId),
          complete: () => {/* noop */},
        });

        // Resolve the promise with external sub id only after all subscriptions completed
        return Promise.resolve<number>(externalSubscriptionId);
    }

    public unsubscribe(subId: number){
        if ( false === this.subscriptions.hasOwnProperty(subId) ) {
          throw new Error(`${subId} is not a valid subscription id`);
        }

        this.subscriptions[subId].unsubscribe();
        delete this.subscriptions[subId];
    }
}
