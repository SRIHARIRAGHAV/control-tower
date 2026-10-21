import { getDashboardData } from '../backend/handlers/source-handlers';
import { resolver } from './registry';
import { authorize } from './authorization';

resolver.define('getDashboardData', async ({ context }) => {
  const user = authorize(context, 'VIEW');
  return getDashboardData(user.accountId);
});
