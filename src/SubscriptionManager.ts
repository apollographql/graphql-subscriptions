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
          complete: () => this.unsubscribe(externalSubscriptionId),
        });

        // Resolve the promise with external sub id only after all subscriptions completed
        return Promise.resolve<number>(externalSubscriptionId);
    }

    public unsubscribe(subId: number){
        if ( ! this.subscriptions.hasOwnProperty(subId) ) {
          return;
        }

        this.subscriptions[subId].unsubscribe();
        delete this.subscriptions[subId];
    }
}
