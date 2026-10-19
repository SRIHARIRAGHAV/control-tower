import { describe, expect, it } from 'vitest';
import { buildSourceInsights } from '../src/data/source-insights';
import { connectedSourceStateFixture, sourceSnapshotFixture } from './fixtures/source-snapshot';

describe('buildSourceInsights', () => {
  it('summarizes real synced record counts and issue attention signals', () => {
    const result = buildSourceInsights(sourceSnapshotFixture, connectedSourceStateFixture);

    expect(result.totalRecords).toBe(5);
    expect(result.blockedIssues).toBe(1);
    expect(result.highPriorityIssues).toBe(1);
    expect(result.insights.map(({ id }) => id)).toEqual([
      'jira-attention',
      'confluence-metadata',
      'bitbucket-metadata',
    ]);
    expect(result.insights[2]?.detail).toContain('1 recent commit fetched');
  });

  it('shows actionable guidance when connected sources return no records', () => {
    const emptySnapshot = {
      ...sourceSnapshotFixture,
      jiraIssues: [],
      bitbucketRepositories: [],
    };
    const result = buildSourceInsights(emptySnapshot, connectedSourceStateFixture);

    expect(result.totalRecords).toBe(1);
    expect(result.insights.map(({ id }) => id)).toContain('jira-empty');
    expect(result.insights.map(({ id }) => id)).toContain('bitbucket-empty');
  });

  it('does not describe failed sources as empty or connected', () => {
    const state = {
      ...connectedSourceStateFixture,
      jira: { state: 'error' as const, count: 0, message: 'Jira sync failed.' },
      bitbucket: { state: 'error' as const, count: 0, message: 'Bitbucket sync failed.' },
    };
    const result = buildSourceInsights(sourceSnapshotFixture, state);

    expect(result.insights.map(({ id }) => id)).toEqual(['confluence-metadata']);
  });

  it('explains that no summaries are available before the first snapshot', () => {
    const result = buildSourceInsights(null, null);

    expect(result.totalRecords).toBe(0);
    expect(result.insights[0]?.id).toBe('no-snapshot');
  });
});
