import {
  ValidationContext,
  SelectionNode,
  GraphQLError,
} from 'graphql';

// XXX I don't know how else to do this. Can't seem to import from GraphQL.
const FIELD = 'Field';

export function tooManySubscriptionFieldsError(subscriptionName: string): string {
  return `Subscription "${subscriptionName}" must have only one field.`;
}

// XXX we temporarily use this validation rule to make our life a bit easier.

export function subscriptionHasSingleRootField(context: ValidationContext): any {
  const schema = context.getSchema();
  schema.getSubscriptionType();
  return {
    OperationDefinition(node) {
      const operationName = node.name ? node.name.value : '';
      let numFields = 0;
      node.selectionSet.selections.forEach( (selection: SelectionNode) => {
        if (selection.kind === FIELD) {
          numFields++;
        } else {
          // why the heck use a fragment on the Subscription type? Just ... don't
          context.reportError(new GraphQLError('Apollo subscriptions do not support fragments on the root field', [node]));
        }
      });
      if (numFields > 1) {
        context.reportError(new GraphQLError(tooManySubscriptionFieldsError(operationName), [node]));
      }
      return false;
    },
  };
}
