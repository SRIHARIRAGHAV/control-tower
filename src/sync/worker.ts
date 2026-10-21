import type {
  SourceResult,
  SourceStatus,
  SyncState,
  XoneSnapshot,
} from '../shared/types';
import { fetchBitbucketRepositories } from '../connectors/bitbucket';
import { fetchConfluencePages } from '../connectors/confluence';
import { fetchJiraIssues } from '../connectors/jira';

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
    syncedAt: current.state === 'connected' || current.state === 'partial' ? syncedAt : previous?.syncedAt,
  };
}

function hasCurrentData(status: SourceStatus): boolean {
  return status.state === 'connected' || status.state === 'partial';
}

export async function synchronizeSources(
  previous: XoneSnapshot | null,
  previousState: SyncState | null,
  options: { jiraExecutionContext?: 'user' | 'app' } = {},
): Promise<{ snapshot: XoneSnapshot; state: SyncState }> {
  const executionContext = options.jiraExecutionContext ?? 'user';
  const [jira, confluence, bitbucket] = await Promise.all([
    runSource('Jira', () => fetchJiraIssues(executionContext)),
    runSource('Confluence', () => fetchConfluencePages(executionContext)),
    runSource('Bitbucket', fetchBitbucketRepositories),
  ]);
  const syncedAt = new Date().toISOString();

  return {
    snapshot: {
      jiraIssues: hasCurrentData(jira.status) ? jira.data : previous?.jiraIssues ?? [],
      confluencePages: hasCurrentData(confluence.status) ? confluence.data : previous?.confluencePages ?? [],
      bitbucketRepositories: hasCurrentData(bitbucket.status) ? bitbucket.data : previous?.bitbucketRepositories ?? [],
      syncedAt: hasCurrentData(jira.status) ? syncedAt : previous?.syncedAt ?? '',
    },
    state: {
      jira: withLastSuccess(jira.status, previousState?.jira, syncedAt),
      confluence: withLastSuccess(confluence.status, previousState?.confluence, syncedAt),
      bitbucket: withLastSuccess(bitbucket.status, previousState?.bitbucket, syncedAt),
      syncedAt,
    },
  };
}
