import { readStoredSourceData } from '../persistence/source-storage';
import { syncAndStore } from '../../sync/snapshot';
import type { DashboardDataResponse } from '../../shared/types';
import { readLatestData } from '../../db/client';

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
  return {
    snapshot: stored.snapshot,
    state: stored.state ?? initialLiveState(),
    ...(stored.forecast ? { forecast: stored.forecast } : {}),
  };
}

export async function syncSources(requester: 'user' | 'app' = 'user') {
  return syncAndStore(requester);
}

export async function getForecastDiagnostics() {
  const { snapshot, state } = await readLatestData();
  const now = Date.now();
  const issues = snapshot?.jiraIssues ?? [];
  const repositories = snapshot?.bitbucketRepositories ?? [];
  const pages = snapshot?.confluencePages ?? [];
  const cutoff = now - 90 * 24 * 60 * 60 * 1000;
  const resolvedIn90Days = issues.filter((issue) => {
    const resolvedAt = issue.resolvedAt ? Date.parse(issue.resolvedAt) : NaN;
    const done = issue.statusCategory
      ? issue.statusCategory.toLowerCase() === 'done'
      : /^(done|closed|resolved|complete|completed)$/i.test(issue.status.trim());
    return done && Number.isFinite(resolvedAt) && resolvedAt >= cutoff && resolvedAt <= now &&
      Boolean(issue.createdAt && Number.isFinite(Date.parse(issue.createdAt)));
  }).length;
  const source = (name: 'jira' | 'confluence' | 'bitbucket') => {
    const status = state?.[name];
    const syncedAt = status?.syncedAt ? Date.parse(status.syncedAt) : NaN;
    return {
      state: status?.state ?? 'not-synced',
      ageMs: Number.isFinite(syncedAt) ? Math.max(0, now - syncedAt) : null,
      cached: status?.state === 'error' && Number.isFinite(syncedAt),
      message: status?.message ?? 'No source synchronization state is stored.',
    };
  };

  return {
    counts: {
      issuesTotal: issues.length,
      resolvedIn90Days,
      withDueDate: issues.filter((issue) => Boolean(issue.dueDate)).length,
      withCreatedAt: issues.filter((issue) => Boolean(issue.createdAt)).length,
      reopenEvents: issues.reduce((count, issue) => count + (issue.reopenedAt?.length ?? 0), 0),
      repositories: repositories.length,
      pullRequests: repositories.reduce((count, repository) => count + (repository.pullRequests?.length ?? 0), 0),
      mergedPullRequests: repositories.reduce((count, repository) =>
        count + (repository.pullRequests?.filter((pullRequest) => pullRequest.state === 'MERGED').length ?? 0), 0),
      pipelines: repositories.reduce((count, repository) => count + (repository.pipelines?.length ?? 0), 0),
      failedPipelines: repositories.reduce((count, repository) =>
        count + (repository.pipelines?.filter((pipeline) => pipeline.result === 'FAILED').length ?? 0), 0),
      pages: pages.length,
      pagesWithLastModified: pages.filter((page) => Boolean(page.lastModified)).length,
    },
    jiraFields: {
      resolvedIds: state?.jira.resolvedFieldIds ?? [],
      missingNames: state?.jira.missingFields ?? [],
      ambiguousNames: state?.jira.ambiguousFields ?? [],
    },
    sources: {
      jira: source('jira'),
      confluence: source('confluence'),
      bitbucket: source('bitbucket'),
    },
    thresholds: {
      deliveryResolvedIssuesRequired: 15,
      deliveryWindowDays: 90,
      anomalyObservationWeeksRequired: 8,
      anomalyEventsRequired: 3,
    },
  };
}
