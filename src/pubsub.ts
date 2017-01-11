//
// This is basically just event emitters wrapped with a function that filters messages.
//
import { EventEmitter } from 'events';
import graphql, {
    GraphQLSchema,
    GraphQLError,
    validate,
    execute,
    parse,
    specifiedRules,
    OperationDefinition,
    Field,
    Variable,
    IntValue,
} from 'graphql';

const valueFromAST = require('graphql').valueFromAST;

import {
    subscriptionHasSingleRootField
} from './validation';

export interface PubSubEngine {
  publish(triggerName: string, payload: any): boolean
  subscribe(triggerName: string, onMessage: Function, options: Object): Promise<number>
  unsubscribe(subId: number)
}

export class PubSub implements PubSubEngine {
    private ee: EventEmitter;
    private subscriptions: {[key: string]: [string, Function]};
    private subIdCounter: number;

    constructor(){
        this.ee = new EventEmitter(); // max listeners = 10.
        this.subscriptions = {};
        this.subIdCounter = 0;
    }

    public publish(triggerName: string, payload: any): boolean {
        this.ee.emit(triggerName, payload);
        // Not using the value returned from emit method because it gives
        // irrelevant false when there are no listeners.
        return true;
    }

    public subscribe(triggerName: string, onMessage: Function): Promise<number> {
        this.ee.addListener(triggerName, onMessage);
        this.subIdCounter = this.subIdCounter + 1;
        this.subscriptions[this.subIdCounter] = [triggerName, onMessage];
        return Promise.resolve(this.subIdCounter);
    }

    public unsubscribe(subId: number) {
        const [triggerName, onMessage] = this.subscriptions[subId];
        delete this.subscriptions[subId];
        this.ee.removeListener(triggerName, onMessage);
    }
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

export interface SubscriptionOptions {
    query: string;
    operationName: string;
    callback: Function;
    variables?: { [key: string]: any };
    context?: any;
    formatError?: Function;
    formatResponse?: Function;
};

export interface TriggerConfig {
    channelOptions?: Object;
    filter?: Function;
}

export interface TriggerMap {
    [triggerName: string]: TriggerConfig;
}

export interface SetupFunction {
    (options: SubscriptionOptions, args: {[key: string]: any}, subscriptionName: string): TriggerMap;
}

export interface SetupFunctions {
    [subscriptionName: string]: SetupFunction;
}

// This manages actual GraphQL subscriptions.
export class SubscriptionManager {
    private pubsub: PubSubEngine;
    private schema: GraphQLSchema;
    private setupFunctions: SetupFunctions;
    private subscriptions: { [externalId: number]: Array<number>};
    private maxSubscriptionId: number;

    constructor(options: {  schema: GraphQLSchema,
                            setupFunctions: SetupFunctions,
                            pubsub: PubSubEngine }){
        this.pubsub = options.pubsub;
        this.schema = options.schema;
        this.setupFunctions = options.setupFunctions || {};
        this.subscriptions = {};
        this.maxSubscriptionId = 0;
    }

    public publish(triggerName: string, payload: any) {
        this.pubsub.publish(triggerName, payload);
    }

    public subscribe(options: SubscriptionOptions): Promise<number> {

        // 1. validate the query, operationName and variables
        const parsedQuery = parse(options.query);
        const errors = validate(
            this.schema,
            parsedQuery,
            [...specifiedRules, subscriptionHasSingleRootField]
        );

        // TODO: validate that all variables have been passed (and are of correct type)?
        if (errors.length){
            // this error kills the subscription, so we throw it.
            return Promise.reject<number>(new ValidationError(errors));
        }

        const args = {};

        // operationName is the name of the only root field in the subscription document
        let subscriptionName = '';
        parsedQuery.definitions.forEach( definition => {
            if (definition.kind === 'OperationDefinition'){
                // only one root field is allowed on subscription. No fragments for now.
                const rootField = (definition as OperationDefinition).selectionSet.selections[0] as Field;
                subscriptionName = rootField.name.value;

                const fields = this.schema.getSubscriptionType().getFields();
                rootField.arguments.forEach( arg => {
                    // we have to get the one arg's definition from the schema
                    const argDefinition = fields[subscriptionName].args.filter(
                        argDef => argDef.name === arg.name.value
                    )[0];
                    args[argDefinition.name] = valueFromAST(arg.value, argDefinition.type, options.variables);
                });
            }
        });

        let triggerMap: TriggerMap;

        if (this.setupFunctions[subscriptionName]) {
            triggerMap = this.setupFunctions[subscriptionName](options, args, subscriptionName);
        } else {
            // if not provided, the triggerName will be the subscriptionName, The trigger will not have any
            // options and rely on defaults that are set later.
            triggerMap = {[subscriptionName]: {}};
        }

        const externalSubscriptionId = this.maxSubscriptionId++;
        this.subscriptions[externalSubscriptionId] = [];
        const subscriptionPromises = [];
        Object.keys(triggerMap).forEach( triggerName => {
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
                let contextPromise;
                if (typeof options.context === 'function') {
                    contextPromise = new Promise((resolve) => {
                        resolve(options.context());
                    });
                } else {
                    contextPromise = Promise.resolve(options.context);
                }
                return contextPromise.then((context) => {
                    if (!filter(rootValue, context)) {
                        return;
                    }
                    execute(
                        this.schema,
                        parsedQuery,
                        rootValue,
                        context,
                        options.variables,
                        options.operationName
                    ).then( data => options.callback(null, data) )
                }).catch((error) => {
                    options.callback(error);
                });
            }

            // 3. subscribe and keep the subscription id
            const subsPromise = this.pubsub.subscribe(triggerName, onMessage, channelOptions);
            subsPromise.then(id => this.subscriptions[externalSubscriptionId].push(id));

            subscriptionPromises.push(subsPromise);
        });

        // Resolve the promise with external sub id only after all subscriptions completed
        return Promise.all(subscriptionPromises).then(() => externalSubscriptionId);
    }

    public unsubscribe(subId){
        // pass the subId right through to pubsub. Do nothing else.
        this.subscriptions[subId].forEach( internalId => {
            this.pubsub.unsubscribe(internalId);
        });
        delete this.subscriptions[subId]
    }
}
