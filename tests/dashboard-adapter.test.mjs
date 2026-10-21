import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anomalyForecastStatus,
  forecastTooltip,
  mapPotentialRisks,
  potentialForecastStatus,
} from '../src/forecast/dashboard-adapter.ts';

function forecast(overrides = {}) {
  return {
    generatedAt: '2026-10-21T12:00:00.000Z',
    dataState: 'fresh',
    sources: {
      jira: { state: 'connected', syncedAt: '2026-10-21T11:00:00.000Z', ageMs: 3_600_000, cached: false },
    },
    potentialRisks: { status: 'insufficient-data', have: 0, need: 15, reason: 'not enough history', missingInput: 'Jira cycle time' },
    anomalies: { status: 'insufficient-data', have: 0, need: 3, reason: 'no event history', missingInput: 'Jira reopenedAt' },
    ...overrides,
  };
}

test('forecast status distinguishes missing, partial, stale, and insufficient inputs', () => {
  assert.equal(potentialForecastStatus(undefined), 'unavailable');
  assert.equal(potentialForecastStatus(forecast({ dataState: 'partial' })), 'partial');
  assert.equal(potentialForecastStatus(forecast({ dataState: 'stale' })), 'stale');
  assert.equal(potentialForecastStatus(forecast()), 'insufficient data (0/15)');
  assert.equal(anomalyForecastStatus(forecast()), 'insufficient data (0/3)');
});

test('forecast tooltip reports source freshness and explicit risk basis', () => {
  const text = forecastTooltip(forecast({
    potentialRisks: {
      status: 'ready',
      items: [{
        id: 'fp-prs', risk: 'Open PR aging', basis: 'heuristic',
      }],
    },
  }));

  assert.match(text, /jira: connected, 60 minutes old/);
  assert.match(text, /fp-prs: Open PR aging \[heuristic\]/);
});

test('potential-risk adapter preserves source identity and does not invent a due date', () => {
  const [risk] = mapPotentialRisks([{
    id: 'fp-prs',
    dept: 'Engineering',
    project: 'workspace/repository',
    lvl: 'h',
    day: 14,
    type: 'internal',
    area: 'Quality',
    risk: 'Open PR aging',
    cause: 'Open pull request age exceeds observed history',
    impact: 'Review delay',
    action: 'Review pull request status',
    owner: '',
    window: 30,
    basis: 'heuristic',
  }]);

  assert.equal(risk.id, 'fp-prs');
  assert.equal(risk.key, 'fp-prs');
  assert.equal(risk.open, true);
  assert.equal(risk.age, null);
  assert.equal(risk.dueDate, '');
  assert.equal(risk.owner, '');
});
