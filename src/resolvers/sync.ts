import { syncSources } from '../backend/handlers/source-handlers';
import { syncAndStore } from '../sync/snapshot';
import { resolver } from './registry';
import { authorize } from './authorization';

resolver.define('syncNow', async ({ context }) => {
  const user = authorize(context, 'SYNC');
  return syncSources(user.accountId);
});

export async function hourlySync() {
  const result = await syncAndStore({ jiraExecutionContext: 'app' });
  if ([result.state.jira, result.state.confluence, result.state.bitbucket].every(
    (source) => source.state === 'error' || source.state === 'not-configured',
  )) {
    throw new Error('Scheduled source sync failed for every configured integration.');
  }
}
