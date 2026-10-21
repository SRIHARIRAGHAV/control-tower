import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRiskForecast } from '../src/forecast/risk-forecast.ts';

const now = new Date('2026-10-21T12:00:00.000Z');

test('returns explicit insufficient-data states when source history is unavailable', () => {
  const result = buildRiskForecast({ issues: [], repos: [], pages: [] }, now);
  assert.equal(result.delivery.status, 'insufficient-data');
  assert.equal(result.anomalies.status, 'insufficient-data');
  assert.equal(result.potentialRisks.status, 'insufficient-data');
  assert.equal(result.generatedAt, now.toISOString());
});

test('keeps forecast results deterministic for the same input and reference time', () => {
  const issues = Array.from({ length: 20 }, (_, index) => ({
    key: `T-${index}`, project: 'Test', status: 'Done', priority: 'Medium',
    createdAt: new Date(now.getTime() - (30 + index) * 86_400_000).toISOString(),
    resolvedAt: new Date(now.getTime() - (20 + index % 8) * 86_400_000).toISOString(),
    dueDate: '2026-10-25',
  }));
  const input = { issues, repos: [], pages: [] };
  assert.deepEqual(buildRiskForecast(input, now), buildRiskForecast(input, now));
});
