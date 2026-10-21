import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRiskForecast, forecastAnomalies } from '../src/forecast/risk-forecast.ts';

const now = new Date('2026-10-21T12:00:00.000Z');

function resolvedIssues(count) {
  return Array.from({ length: count }, (_, index) => ({
    key: `CT-${index + 1}`,
    project: 'Control Tower',
    status: 'Closed',
    statusCategory: 'done',
    priority: 'Medium',
    createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    resolvedAt: `2026-09-${String(index + 3).padStart(2, '0')}T00:00:00.000Z`,
  }));
}

test('delivery reports exact insufficient resolved count below the exported minimum', () => {
  const result = buildRiskForecast({ issues: resolvedIssues(14), repos: [], pages: [] }, now);

  assert.equal(result.delivery.status, 'insufficient-data');
  assert.equal(result.delivery.have, 14);
  assert.equal(result.delivery.need, result.thresholds.minResolvedIssues);
  assert.match(result.delivery.missingInput, /createdAt/);
});

test('anomaly history accepts zero-event weeks when observation coverage and total events are sufficient', () => {
  const result = forecastAnomalies({
    issues: [{
      key: 'CT-1',
      project: 'Control Tower',
      status: 'Closed',
      priority: 'Medium',
      reopenedAt: [
        '2026-10-20T01:00:00.000Z',
        '2026-10-20T02:00:00.000Z',
        '2026-10-20T03:00:00.000Z',
      ],
    }],
    repos: [],
    pages: [],
    reopenHistoryWeeks: 9,
    pipelineHistoryWeeks: 9,
  }, now);

  assert.equal(result.status, 'ready');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].now, 3);
  assert.equal(result.items[0].hist.length, 8);
  assert.ok(result.items[0].hist.includes(0));
});

test('anomaly insufficiency reports missing history and event thresholds', () => {
  const result = forecastAnomalies({ issues: [], repos: [], pages: [] }, now);

  assert.equal(result.status, 'insufficient-data');
  assert.match(result.reason, /reopenedAt: 0 events in 0 observed weeks/);
  assert.match(result.reason, /Bitbucket pipelines: 0 events in 0 observed weeks/);
  assert.equal(result.missingInput, 'Jira reopenedAt / Bitbucket pipeline history');
});

test('invalid cycle-time dates are excluded and heuristic pull-request risks expose no probability', () => {
  const issues = resolvedIssues(16);
  issues[0].createdAt = 'invalid';
  const repos = [{
    fullName: 'workspace/repository',
    pullRequests: [
      ...Array.from({ length: 15 }, (_, index) => ({
        createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        mergedAt: `2026-09-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`,
        state: 'MERGED',
      })),
      { createdAt: '2026-09-01T00:00:00.000Z', state: 'OPEN' },
    ],
  }];
  const result = buildRiskForecast({ issues, repos, pages: [] }, now);
  const pullRequestRisk = result.potentialRisks.status === 'ready'
    ? result.potentialRisks.items.find((item) => item.id === 'fp-prs')
    : undefined;

  assert.equal(result.delivery.status, 'ready');
  assert.equal(pullRequestRisk?.basis, 'heuristic');
  assert.equal(pullRequestRisk?.probability, undefined);
});

test('old pull-request history and stale-looking page titles do not create forecast risks', () => {
  const result = buildRiskForecast({
    issues: [],
    repos: [{
      fullName: 'workspace/repository',
      pullRequests: [
        ...Array.from({ length: 15 }, (_, index) => ({
          createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
          mergedAt: `2026-01-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`,
          state: 'MERGED',
        })),
        { createdAt: '2026-01-01T00:00:00.000Z', state: 'OPEN' },
      ],
    }],
    pages: [{ title: 'Decision record', lastModified: '2026-01-01T00:00:00.000Z' }],
  }, now);

  assert.equal(result.potentialRisks.status, 'insufficient-data');
});
