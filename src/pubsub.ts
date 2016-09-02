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
  subscribe(triggerName: string, onMessage: Function): number
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

    public subscribe(triggerName: string, onMessage: Function): number {
        this.ee.addListener(triggerName, onMessage);
        this.subIdCounter = this.subIdCounter + 1;
        this.subscriptions[this.subIdCounter] = [triggerName, onMessage];
        return this.subIdCounter;
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

// This manages actual GraphQL subscriptions.
export class SubscriptionManager {
    private pubsub: PubSubEngine;
    private schema: GraphQLSchema;
    private setupFunctions: { [subscriptionName: string]: Function };
    private subscriptions: { [externalId: number]: Array<number>};
    private maxSubscriptionId: number;

    constructor(options: {  schema: GraphQLSchema,
                            setupFunctions: {[subscriptionName: string]: Function},
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

    public subscribe(options: SubscriptionOptions): number {

        if (!options.operationName){
            throw new Error('Must provide operationName');
        }

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
            throw new ValidationError(errors);
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

        // if not provided, the triggerName will be the subscriptionName, and
        // the filter will always return true.
        let triggerMap = {[subscriptionName]: () => true};
        if (this.setupFunctions[subscriptionName]){
            triggerMap = this.setupFunctions[subscriptionName](options, args, subscriptionName);
        }

        const externalSubscriptionId = this.maxSubscriptionId++;
        this.subscriptions[externalSubscriptionId] = [];
        Object.keys(triggerMap).forEach( triggerName => {
            // 2. generate the filter function and the handler function
            const onMessage = rootValue => {
                // rootValue is the payload sent by the event emitter / trigger
                // by convention this is the value returned from the mutation resolver

                try {
                    execute(
                        this.schema,
                        parsedQuery,
                        rootValue,
                        context,
                        options.variables,
                        options.operationName
                    ).then( data => options.callback(null, data) )
                } catch (e) {
                    // this does not kill the subscription, it could be a temporary failure
                    // TODO: when could this happen?
                    // It's not a GraphQL error, so what do we do with it?
                    options.callback(e);
                }
            }

            const isTriggering: Function = triggerMap[triggerName];

            // 3. subscribe and return the subscription id
            this.subscriptions[externalSubscriptionId].push(
                // Will run the onMessage function only if the message passes the filter function.
                this.pubsub.subscribe(triggerName, (data) => isTriggering(data) && onMessage(data))
            );
        });
        return externalSubscriptionId;
    }

    public unsubscribe(subId){
        // pass the subId right through to pubsub. Do nothing else.
        this.subscriptions[subId].forEach( internalId => {
            this.pubsub.unsubscribe(internalId);
        });
    }
}
