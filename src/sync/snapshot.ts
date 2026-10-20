import { readRiskForecast, readSnapshot, readSyncState, writeSyncResult } from '../db/client';
import { buildRiskForecast } from '../forecast/risk-forecast';
import { synchronizeSources } from './worker';

export async function syncAndStore() {
  const [previous, previousState, previousForecast] = await Promise.all([
    readSnapshot(),
    readSyncState(),
    readRiskForecast(),
  ]);
  const result = await synchronizeSources(previous, previousState);
  const anySourceConnected = [result.state.jira, result.state.confluence, result.state.bitbucket]
    .some((source) => source.state === 'connected');
  const forecast = anySourceConnected
    ? buildRiskForecast({
        issues: result.snapshot.jiraIssues.map((issue) => ({
          key: issue.key,
          project: issue.project,
          status: issue.status,
          priority: issue.priority,
          owner: issue.owner,
          department: issue.department,
          client: issue.client,
          createdAt: issue.createdAt,
          dueDate: issue.dueDate,
          resolvedAt: issue.resolvedAt,
        })),
        repos: result.snapshot.bitbucketRepositories.map((repository) => ({ fullName: repository.fullName })),
        pages: result.snapshot.confluencePages.map((page) => ({ title: page.title })),
      })
    : previousForecast ?? undefined;
  await writeSyncResult(result.snapshot, result.state, forecast);
  return { ...result, ...(forecast ? { forecast } : {}) };
}
