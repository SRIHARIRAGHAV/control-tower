import type { SyncState, XoneSnapshot } from '../shared/types';
import type { SourceInsight, SourceInsightSummary } from '../types/source-insights';

const highPriorityNames = new Set(['blocker', 'critical', 'highest', 'high']);

function isConnected(
  state: SyncState | null,
  source: 'jira' | 'confluence' | 'bitbucket',
): boolean {
  return state?.[source]?.state === 'connected';
}

export function buildSourceInsights(
  snapshot: XoneSnapshot | null,
  state: SyncState | null,
): SourceInsightSummary {
  if (!snapshot) {
    return {
      totalRecords: 0,
      blockedIssues: 0,
      highPriorityIssues: 0,
      insights: [{
        id: 'no-snapshot',
        tone: 'info',
        title: 'No source snapshot yet',
        detail: 'Run a source sync to calculate summaries from connected Jira, Confluence, and Bitbucket data.',
      }],
    };
  }

  const blockedIssues = snapshot.jiraIssues.filter((issue) =>
    issue.status.toLowerCase().includes('block'),
  ).length;
  const highPriorityIssues = snapshot.jiraIssues.filter((issue) =>
    highPriorityNames.has(issue.priority.toLowerCase()),
  ).length;
  const bitbucketCommitCount = snapshot.bitbucketRepositories.reduce(
    (count, repository) => count + (repository.recentCommits?.length ?? 0),
    0,
  );
  const insights: SourceInsight[] = [];

  if (isConnected(state, 'jira')) {
    if (snapshot.jiraIssues.length === 0) {
      insights.push({
        id: 'jira-empty',
        tone: 'warning',
        title: 'No Jira issues are visible to the app',
        detail: 'Check that the app can browse projects containing issues, then sync again.',
      });
    } else if (blockedIssues || highPriorityIssues) {
      insights.push({
        id: 'jira-attention',
        tone: 'warning',
        title: 'Jira issues may need attention',
        detail: `${blockedIssues} blocked and ${highPriorityIssues} high-priority ${highPriorityIssues === 1 ? 'issue' : 'issues'} in the latest synced records.`,
      });
    } else {
      insights.push({
        id: 'jira-clear',
        tone: 'info',
        title: 'No blocked or high-priority Jira issues found',
        detail: `Checked ${snapshot.jiraIssues.length} synced ${snapshot.jiraIssues.length === 1 ? 'issue' : 'issues'}; this summary uses status and priority only.`,
      });
    }
  }

  if (isConnected(state, 'confluence')) {
    insights.push({
      id: 'confluence-metadata',
      tone: 'info',
      title: `${snapshot.confluencePages.length} Confluence ${snapshot.confluencePages.length === 1 ? 'page' : 'pages'} synced`,
      detail: 'The current integration reads page titles and space IDs only; page contents are not analyzed.',
    });
  }

  if (isConnected(state, 'bitbucket')) {
    insights.push(
      snapshot.bitbucketRepositories.length === 0
        ? {
            id: 'bitbucket-empty',
            tone: 'warning',
            title: 'No Bitbucket repositories are visible',
            detail: 'Check the configured workspace and repository read access, then sync again.',
          }
        : {
            id: 'bitbucket-metadata',
            tone: 'info',
            title: `${snapshot.bitbucketRepositories.length} Bitbucket ${snapshot.bitbucketRepositories.length === 1 ? 'repository' : 'repositories'} synced`,
            detail: `${bitbucketCommitCount} recent ${bitbucketCommitCount === 1 ? 'commit' : 'commits'} fetched across these repositories; pull requests and pipelines are not currently fetched.`,
          },
    );
  }

  return {
    totalRecords:
      snapshot.jiraIssues.length +
      snapshot.confluencePages.length +
      snapshot.bitbucketRepositories.length +
      bitbucketCommitCount,
    blockedIssues,
    highPriorityIssues,
    insights,
  };
}
