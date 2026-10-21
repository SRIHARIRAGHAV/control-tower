import { readSnapshot, readSyncState, writeSyncResult } from '../db/client';
import { buildRiskForecast } from '../forecast/risk-forecast';
import { isSourceFresh } from '../shared/data-freshness';
import type { SourceStatus } from '../shared/types';
import { synchronizeSources } from './worker';

function forecastSourceFreshness(status: SourceStatus | undefined, now: Date) {
  const timestamp = status?.syncedAt;
  const ageMs = timestamp ? now.getTime() - Date.parse(timestamp) : null;
  return {
    state: status?.state ?? 'not-synced',
    ...(timestamp ? { syncedAt: timestamp } : {}),
    ageMs: ageMs !== null && Number.isFinite(ageMs) ? Math.max(0, ageMs) : null,
    cached: status?.state === 'error' && Boolean(timestamp),
  };
}

export async function syncAndStore(requester: 'user' | 'app' = 'user') {
  const [previous, previousState] = await Promise.all([
    readSnapshot(),
    readSyncState(),
  ]);
  const result = await synchronizeSources(previous, previousState, requester);
  const now = new Date();
  const baseForecast = (result.state.jira.state === 'connected' || result.state.jira.state === 'partial')
    ? buildRiskForecast({
        issues: result.snapshot.jiraIssues.map((issue) => ({
          key: issue.key,
          project: issue.project,
          status: issue.status,
          statusCategory: issue.statusCategory,
          priority: issue.priority,
          owner: issue.owner,
          department: issue.department,
          client: issue.client,
          createdAt: issue.createdAt,
          dueDate: issue.dueDate,
          resolvedAt: issue.resolvedAt,
          reopenedAt: issue.reopenedAt,
        })),
        repos: (result.state.bitbucket.state === 'connected' || result.state.bitbucket.state === 'partial')
          ? result.snapshot.bitbucketRepositories.map((repository) => ({
              fullName: repository.fullName,
              pullRequests: repository.pullRequests,
              pipelines: repository.pipelines,
            }))
          : [],
        pages: (result.state.confluence.state === 'connected' || result.state.confluence.state === 'partial')
          ? result.snapshot.confluencePages.map((page) => ({ title: page.title, lastModified: page.lastModified }))
          : [],
      })
    : undefined;
  const forecastSources = {
    jira: forecastSourceFreshness(result.state.jira, now),
    confluence: forecastSourceFreshness(result.state.confluence, now),
    bitbucket: forecastSourceFreshness(result.state.bitbucket, now),
  };
  const hasStaleSource = Object.entries(forecastSources).some(([name, source]) =>
    source.syncedAt
      ? !isSourceFresh(source.syncedAt, now.getTime())
      : name === 'jira' || source.state === 'connected' || source.state === 'partial',
  );
  const hasPartialSource = Object.values(forecastSources).some((source) =>
    source.state !== 'connected',
  );
  const forecast = baseForecast ? {
    ...baseForecast,
    dataState: hasStaleSource ? 'stale' as const : hasPartialSource ? 'partial' as const : 'fresh' as const,
    sources: forecastSources,
  } : undefined;
  await writeSyncResult(result.snapshot, result.state, forecast);
  return { ...result, ...(forecast ? { forecast } : {}) };
}
