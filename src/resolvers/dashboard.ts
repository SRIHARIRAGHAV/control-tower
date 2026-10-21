import { getDashboardData } from '../backend/handlers/source-handlers';
import { resolver } from './registry';
import { requireRole } from './authorization';

resolver.define('getDashboardData', async ({ context }) => {
  requireRole(context, 'executive');
  return getDashboardData();
});
