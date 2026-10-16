import type {
  SourceResult,
  SourceStatus,
  SyncState,
  XoneSnapshot,
} from '../../domain/contracts';
import { fetchBitbucketRepositories } from '../integrations/bitbucket';
import { fetchConfluencePages } from '../integrations/confluence';
import { fetchJiraIssues } from '../integrations/jira';

async function runSource<T>(
  name: string,
  run: () => Promise<SourceResult<T>>,
): Promise<SourceResult<T>> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected integration error occurred.';
    return { data: [], status: { state: 'error', count: 0, message: `${name} sync failed: ${message}` } };
  }
}

function withLastSuccess(
  current: SourceStatus,
  previous: SourceStatus | undefined,
  syncedAt: string,
): SourceStatus {
  return {
    ...current,
    syncedAt: current.state === 'connected' ? syncedAt : previous?.syncedAt,
  };
}

export async function synchronizeSources(
  previous: XoneSnapshot | null,
  previousState: SyncState | null,
): Promise<{ snapshot: XoneSnapshot; state: SyncState }> {
  const [jira, confluence, bitbucket] = await Promise.all([
    runSource('Jira', fetchJiraIssues),
    runSource('Confluence', fetchConfluencePages),
    runSource('Bitbucket', fetchBitbucketRepositories),
  ]);
  const syncedAt = new Date().toISOString();

  return {
    snapshot: {
      jiraIssues: jira.status.state === 'connected' ? jira.data : previous?.jiraIssues ?? [],
      confluencePages: confluence.status.state === 'connected' ? confluence.data : previous?.confluencePages ?? [],
      bitbucketRepositories:
        bitbucket.status.state === 'connected' ? bitbucket.data : previous?.bitbucketRepositories ?? [],
      syncedAt,
    },
    state: {
      jira: withLastSuccess(jira.status, previousState?.jira, syncedAt),
      confluence: withLastSuccess(confluence.status, previousState?.confluence, syncedAt),
      bitbucket: withLastSuccess(bitbucket.status, previousState?.bitbucket, syncedAt),
      syncedAt,
    },
  };
}
