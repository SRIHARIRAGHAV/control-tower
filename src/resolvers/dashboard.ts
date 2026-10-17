import { readSnapshot, readSyncState } from '../db/client';
import { resolver } from './registry';

resolver.define('getDashboardData', async () => {
  const [snapshot, storedState] = await Promise.all([readSnapshot(), readSyncState()]);
  const configured = Boolean(
    process.env.BITBUCKET_WORKSPACE?.trim() &&
      process.env.BITBUCKET_WORKSPACE_ACCESS_TOKEN?.trim(),
  );
  const state =
    storedState ??
    ({
      jira: { state: 'not-synced', count: 0, message: 'Run a sync to check Jira access.' },
      confluence: { state: 'not-synced', count: 0, message: 'Run a sync to check Confluence access.' },
      bitbucket: {
        state: configured ? 'not-synced' : 'not-configured',
        count: 0,
        message: configured ? 'Run a sync to check Bitbucket access.' : 'Bitbucket credentials are not configured.',
      },
    } as const);
  return { snapshot, state };
});
