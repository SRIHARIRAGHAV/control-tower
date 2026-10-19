import { readStoredSourceData } from '../persistence/source-storage';
import { syncAndStore } from '../../sync/snapshot';
import type { DashboardDataResponse } from '../../shared/types';

function initialLiveState(): DashboardDataResponse['state'] {
  const env = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  const bitbucketConfigured = Boolean(
    env?.BITBUCKET_WORKSPACE?.trim() &&
      env?.BITBUCKET_OAUTH_CLIENT_ID?.trim() &&
      env?.BITBUCKET_OAUTH_CLIENT_SECRET?.trim(),
  );

  return {
    jira: { state: 'not-synced', count: 0, message: 'Run a sync to check Jira access.' },
    confluence: { state: 'not-synced', count: 0, message: 'Run a sync to check Confluence access.' },
    bitbucket: {
      state: bitbucketConfigured ? 'not-synced' : 'not-configured',
      count: 0,
      message: bitbucketConfigured
        ? 'Run a sync to check Bitbucket access.'
        : 'Bitbucket credentials are not configured.',
    },
  };
}

export async function getDashboardData(): Promise<DashboardDataResponse> {
  const stored = await readStoredSourceData();
  return { snapshot: stored.snapshot, state: stored.state ?? initialLiveState() };
}

export async function syncSources() {
  return syncAndStore();
}
