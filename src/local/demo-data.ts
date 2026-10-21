import { buildRiskForecast } from '../forecast/risk-forecast';
import type { DashboardDataResponse, JiraIssueSummary, BitbucketRepositorySummary, ConfluencePageSummary } from '../shared/types';

const DAY_MS = 86_400_000;
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
const dateDaysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);

/** Synthetic fixtures for local UI development only. Never represents live company data. */
function buildDemoSnapshot(): DashboardDataResponse {
  const resolvedIssues: JiraIssueSummary[] = Array.from({ length: 20 }, (_, index) => {
    const createdAgo = 28 + index * 2;
    const cycleDays = 3 + (index % 8);
    const resolvedAgo = Math.max(1, createdAgo - cycleDays);
    return {
      key: `DEMO-${index + 1}`,
      summary: `Demo delivery work item ${index + 1}`,
      status: 'Done',
      priority: index % 5 === 0 ? 'High' : 'Medium',
      project: index % 2 === 0 ? 'Executive Portal' : 'Platform Modernization',
      updated: isoDaysAgo(resolvedAgo),
      createdAt: isoDaysAgo(createdAgo),
      resolvedAt: isoDaysAgo(resolvedAgo),
      dueDate: new Date(Date.now() - (resolvedAgo - (index % 3)) * DAY_MS).toISOString().slice(0, 10),
      department: index % 2 === 0 ? 'Engineering' : 'Operations',
      owner: index % 3 === 0 ? 'Demo owner' : 'Unassigned',
      client: index % 4 === 0 ? 'Demo client' : undefined,
      impactArea: index % 2 === 0 ? 'Client delivery' : 'Quality',
    };
  });

  const openIssues: JiraIssueSummary[] = Array.from({ length: 6 }, (_, index) => ({
    key: `DEMO-${101 + index}`,
    summary: ['Review release readiness', 'Resolve payment integration blocker', 'Complete security validation', 'Confirm stakeholder decision', 'Close regression defects', 'Prepare rollout plan'][index],
    status: index === 1 ? 'Blocked' : index < 3 ? 'In Progress' : 'To Do',
    priority: index < 2 ? 'High' : 'Medium',
    project: index % 2 === 0 ? 'Executive Portal' : 'Platform Modernization',
    updated: isoDaysAgo(index + 1),
    createdAt: isoDaysAgo(10 + index * 4),
    dueDate: dateDaysFromNow([3, 5, 9, 13, 21, 28][index]),
    department: index % 2 === 0 ? 'Engineering' : 'Operations',
    impactedDepartment: index === 1 ? 'Operations' : undefined,
    owner: index === 3 ? '' : 'Demo owner',
    client: index === 0 ? 'Demo client' : undefined,
    impactArea: index === 1 ? 'Client delivery' : 'Quality',
    mitigation: index === 1 ? 'Assign a technical owner and confirm the dependency' : undefined,
  }));

  const jiraIssues = [...resolvedIssues, ...openIssues];
  const confluencePages: ConfluencePageSummary[] = [
    { id: 'demo-page-1', title: 'Decision record: Platform architecture', space: 'DEMO', url: '#demo-confluence-1', lastModified: isoDaysAgo(125) },
    { id: 'demo-page-2', title: 'Release readiness checklist', space: 'DEMO', url: '#demo-confluence-2', lastModified: isoDaysAgo(8) },
    { id: 'demo-page-3', title: 'ADR: Deployment strategy', space: 'DEMO', url: '#demo-confluence-3', lastModified: isoDaysAgo(102) },
  ];

  const bitbucketRepositories: BitbucketRepositorySummary[] = [{
    name: 'platform-service', fullName: 'demo-workspace/platform-service', url: '#demo-repository', updated: isoDaysAgo(1),
    recentCommits: [{ hash: 'demoabc123', message: 'Demo: improve release checks', author: 'Demo contributor', date: isoDaysAgo(1), url: '#demo-commit' }],
  }];

  // The forecast fixture contains synthetic PR/build history to exercise all deterministic branches.
  const forecast = buildRiskForecast({
    issues: jiraIssues.map((issue) => ({
      key: issue.key, project: issue.project, status: issue.status, priority: issue.priority,
      owner: issue.owner, department: issue.department, client: issue.client,
      createdAt: issue.createdAt, dueDate: issue.dueDate, resolvedAt: issue.resolvedAt,
      reopenedAt: [],
    })),
    repos: [{
      fullName: 'demo-workspace/platform-service',
      pullRequests: [
        ...Array.from({ length: 20 }, (_, index) => ({
          createdAt: isoDaysAgo(100 - index * 4),
          mergedAt: isoDaysAgo(98 - index * 4),
          state: 'MERGED' as const,
        })),
        { createdAt: isoDaysAgo(18), state: 'OPEN' as const },
      ],
      pipelines: Array.from({ length: 18 }, (_, index) => ({
        createdAt: isoDaysAgo(index * 4 + 1), result: index < 5 ? 'FAILED' as const : 'SUCCESSFUL' as const,
      })),
    }],
    pages: confluencePages.map((page) => ({ title: page.title, lastModified: page.lastModified })),
  });

  const syncedAt = new Date().toISOString();
  const sourceStatus = (count: number, source: string) => ({
    state: 'connected' as const, count, syncedAt,
    message: `LOCAL DEMO DATA — ${count} synthetic ${source} records. No live provider was contacted.`,
  });
  return {
    snapshot: { jiraIssues, confluencePages, bitbucketRepositories, syncedAt },
    state: {
      jira: sourceStatus(jiraIssues.length, 'Jira-like issue'),
      confluence: sourceStatus(confluencePages.length, 'Confluence-like page'),
      bitbucket: sourceStatus(bitbucketRepositories.length, 'Bitbucket-like repository'),
      syncedAt,
    },
    forecast,
  };
}

export async function getLocalDemoData(): Promise<DashboardDataResponse> {
  return buildDemoSnapshot();
}

export async function syncLocalDemoData(): Promise<DashboardDataResponse> {
  // Fresh timestamps make the UI refresh path demonstrable while retaining synthetic data labels.
  return buildDemoSnapshot();
}
