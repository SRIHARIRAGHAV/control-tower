import './resolvers/dashboard';
import './resolvers/sync';
import './resolvers/claims';
import './resolvers/authentication';
import { resolver } from './resolvers/registry';

export const handler = resolver.getDefinitions();
export { hourlySync } from './resolvers/sync';
