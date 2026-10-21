import { z } from 'zod';
import { getDashboardData, getForecastDiagnostics } from '../backend/handlers/source-handlers';
import { resolver } from './registry';
import { authorize } from './authorization';

const emptyPayloadSchema = z.object({}).strict();

resolver.define('getDashboardData', async ({ payload, context }) => {
  authorize(context, 'view');
  emptyPayloadSchema.parse(payload ?? {});
  return getDashboardData();
});

resolver.define('getForecastDiagnostics', async ({ payload, context }) => {
  authorize(context, 'view');
  emptyPayloadSchema.parse(payload ?? {});
  return getForecastDiagnostics();
});
