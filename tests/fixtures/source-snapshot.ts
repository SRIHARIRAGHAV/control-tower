import type { SyncState, XoneSnapshot } from '../../src/shared/types';

export const sourceSnapshotFixture: XoneSnapshot = {
  jiraIssues: [
    {
      key: 'DEMO-1',
      summary: 'Blocked release approval',
      status: 'Blocked',
      priority: 'High',
      project: 'Demo',
      updated: '2026-10-18T10:00:00.000Z',
    },
    {
      key: 'DEMO-2',
      summary: 'Update onboarding guide',
      status: 'Done',
      priority: 'Low',
      project: 'Demo',
      updated: '2026-10-18T09:00:00.000Z',
    },
  ],
  confluencePages: [
    { id: 'page-1', title: 'Demo decision log', space: 'DEMO', url: '/wiki/spaces/DEMO/pages/page-1' },
  ],
  bitbucketRepositories: [
    {
      name: 'demo-service',
      fullName: 'demo-workspace/demo-service',
      url: 'https://bitbucket.org/demo-workspace/demo-service',
      updated: '2026-10-18T08:00:00.000Z',
      recentCommits: [
        {
          hash: 'abc123',
          message: 'Add Bitbucket commit sync',
          author: 'Demo User <demo@example.com>',
          date: '2026-10-18T07:00:00.000Z',
          url: 'https://bitbucket.org/demo-workspace/demo-service/commits/abc123',
        },
      ],
    },
  ],
  syncedAt: '2026-10-18T10:00:00.000Z',
};

export const connectedSourceStateFixture: SyncState = {
  jira: { state: 'connected', count: 2, message: 'Fetched 2 Jira issues.' },
  confluence: { state: 'connected', count: 1, message: 'Fetched 1 Confluence page.' },
  bitbucket: { state: 'connected', count: 1, message: 'Fetched 1 Bitbucket repository.' },
  syncedAt: '2026-10-18T10:00:00.000Z',
};
