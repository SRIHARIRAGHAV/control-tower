import { readSnapshot, readSyncState, writeSyncResult } from '../db/client';
import { buildRiskForecast } from '../forecast/risk-forecast';
import { synchronizeSources } from './worker';

export async function syncAndStore(options: {
  jiraExecutionContext?: 'user' | 'app';
  storageScope?: string;
} = {}) {
  if (options.jiraExecutionContext === 'user' && !options.storageScope?.trim()) {
    throw new Error('User-context sync requires a server-derived storage scope.');
  }
  const [previous, previousState] = await Promise.all([
    readSnapshot(options.storageScope),
    readSyncState(options.storageScope),
  ]);
  const result = await synchronizeSources(previous, previousState, options);
  const forecast = (result.state.jira.state === 'connected' || result.state.jira.state === 'partial')
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
          reopenedAt: issue.reopenedAt,
        })),
        repos: (result.state.bitbucket.state === 'connected' || result.state.bitbucket.state === 'partial')
          ? result.snapshot.bitbucketRepositories.map((repository) => ({ fullName: repository.fullName, pullRequests: repository.pullRequests, pipelines: repository.pipelines }))
          : [],
        pages: (result.state.confluence.state === 'connected' || result.state.confluence.state === 'partial')
          ? result.snapshot.confluencePages.map((page) => ({ title: page.title, lastModified: page.lastModified }))
          : [],
      })
    : undefined;
  await writeSyncResult(result.snapshot, result.state, forecast, options.storageScope);
  return { ...result, ...(forecast ? { forecast } : {}) };
}
