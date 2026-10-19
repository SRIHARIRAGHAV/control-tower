import { describe, expect, it } from 'vitest';
import { analyzeLiveSources } from '../src/data/live-risk-analysis';
import type { XoneSnapshot } from '../src/shared/types';

const snapshot: XoneSnapshot = {
  jiraIssues: [
    { key: 'KAN-1', summary: 'Blocked high priority task', status: 'Blocked', priority: 'High', project: 'KAN', updated: '2026-10-18T12:00:00.000Z' },
    { key: 'KAN-2', summary: 'Urgent task', status: 'In Progress', priority: 'Highest', project: 'KAN', updated: '2026-10-18T12:00:00.000Z' },
    { key: 'KAN-3', summary: 'Normal task', status: 'To Do', priority: 'Medium', project: 'KAN', updated: '2026-10-18T12:00:00.000Z' },
    { key: 'KAN-4', summary: 'Completed urgent task', status: 'Done', priority: 'Highest', project: 'KAN', updated: '2026-10-18T12:00:00.000Z' },
  ],
  confluencePages: [{ id: '42', title: 'Runbook', space: 'OPS', url: '/wiki/spaces/OPS/pages/42' }],
  bitbucketRepositories: [{ name: 'service', fullName: 'workspace/service', url: 'https://bitbucket.org/workspace/service', updated: '2026-10-18T12:00:00.000Z' }],
  syncedAt: '2026-10-19T12:00:00.000Z',
};

describe('analyzeLiveSources', () => {
  it('derives indicators only from current Jira status and priority and counts all live records', () => {
    const result = analyzeLiveSources(snapshot);

    expect(result.jiraIssueCount).toBe(4);
    expect(result.openIssueCount).toBe(3);
    expect(result.blockedIssueCount).toBe(1);
    expect(result.highPriorityIssueCount).toBe(2);
    expect(result.totalSourceRecords).toBe(6);
    expect(result.indicators.map(({ issue, level }) => [issue.key, level])).toEqual([
      ['KAN-1', 'urgent'],
      ['KAN-2', 'urgent'],
    ]);
    expect(result.indicators[0]?.reasons).toEqual(['Status is Blocked', 'Priority is High']);
  });

  it('does not flag completed issues or fabricate indicators when there are no records', () => {
    const result = analyzeLiveSources({
      ...snapshot,
      jiraIssues: [],
      confluencePages: [],
      bitbucketRepositories: [],
    });

    expect(result.openIssueCount).toBe(0);
    expect(result.indicators).toEqual([]);
    expect(result.totalSourceRecords).toBe(0);
  });
});
