import { z } from 'zod';
import { syncSources } from '../backend/handlers/source-handlers';
import { resolver } from './registry';
import { authorize } from './authorization';

const emptyPayloadSchema = z.object({}).strict();

resolver.define('syncNow', ({ payload, context }) => {
  authorize(context, 'sync');
  emptyPayloadSchema.parse(payload ?? {});
  return syncSources('user');
});

export async function hourlySync() {
  const result = await syncSources('app');
  if ([result.state.jira, result.state.confluence, result.state.bitbucket].every(
    (source) => source.state === 'error' || source.state === 'not-configured',
  )) {
    throw new Error('Scheduled source sync failed for every configured integration.');
  }
}
