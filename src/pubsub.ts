//
// This is basically just event emitters wrapped with a function that filters messages.
//
import { EventEmitter } from 'events';
import { 
    GraphQLSchema,
    GraphQLError,
    validate,
    execute,
    parse,
    specifiedRules
} from 'graphql';

import {
    subscriptionHasSingleRootField
} from './validation';

export class FilteredPubSub {
    private ee: EventEmitter;
    private subscriptions: {[key: string]: [string, Function]};
    private subIdCounter: number;

    constructor(){
        this.ee = new EventEmitter(); // max listeners = 10.
        this.subscriptions = {};
        this.subIdCounter = 0;
    }

    public publish(triggerName: string, payload: any){
        this.ee.emit(triggerName, payload);
    }

    public subscribe(triggerName: string, filterFunc: Function, handler: Function): number{
        // notify handler only if filterFunc returns true
        const onMessage = (data) => filterFunc(data) ? handler(data) : null
        this.ee.addListener(triggerName, onMessage);
        this.subIdCounter = this.subIdCounter + 1;
        this.subscriptions[this.subIdCounter] = [triggerName, onMessage];
        return this.subIdCounter; 
    }

    public unsubscribe(subId: number): void {
        const [triggerName, onMessage] = this.subscriptions[subId];
        delete this.subscriptions[subId];
        this.ee.removeListener(triggerName, onMessage);
    }
}

export class ValidationError extends Error{
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
    private pubsub;
    private schema;

    constructor(options: { schema: GraphQLSchema }){
        this.pubsub = new FilteredPubSub();
        this.schema = options.schema;
    }

    public publish(triggerName: string, payload: any){
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
        // TODO: extract the arguments out of the query instead of just using the variables
        const args = options.variables;

        // TODO: allow other ways of figuring out trigger name than operationName?
        const triggerName = options.operationName;

        // TODO: make better filter functions!
        const filterFunc = () => true;

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
                options.callback(e);
            }
        }

        // 3. subscribe and return the subscription id
        return this.pubsub.subscribe(triggerName, filterFunc, onMessage);
    }

    public unsubscribe(subId){
        // pass the subId right through to pubsub. Do nothing else.
        this.pubsub.unsubscribe(subId);
    }
}