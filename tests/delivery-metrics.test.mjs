import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDeliveryMetrics } from '../src/metrics/delivery-metrics.ts';

const now = new Date('2026-10-21T12:00:00.000Z');

test('calculates on-time delivery from unique resolved issues with due dates in the last 30 days', () => {
  const metrics = calculateDeliveryMetrics([
    { key: 'CT-1', status: 'Done', priority: 'High', dueDate: '2026-10-15', resolvedAt: '2026-10-14T10:00:00Z' },
    { key: 'CT-2', status: 'Resolved', priority: 'Medium', dueDate: '2026-10-15', resolvedAt: '2026-10-16T10:00:00Z' },
    { key: 'CT-3', status: 'Done', priority: 'High', dueDate: '2026-09-20', resolvedAt: '2026-09-20T10:00:00Z' },
    { key: 'CT-4', status: 'In Progress', priority: 'High', dueDate: '2026-10-15', resolvedAt: '2026-10-14T10:00:00Z' },
  ], now);

  assert.equal(metrics.eligibleResolvedIssues, 2);
  assert.equal(metrics.onTimeResolvedIssues, 1);
  assert.equal(metrics.onTimeRate, 50);
});

test('counts blocked, overdue, aged, and incomplete open issues without treating unknown status as open', () => {
  const metrics = calculateDeliveryMetrics([
    { key: 'CT-1', status: 'Blocked', priority: 'Critical', createdAt: '2026-10-01', dueDate: '2026-10-20' },
    { key: 'CT-2', status: 'In Progress', priority: 'Unset', createdAt: '2026-10-21', owner: '' },
    { key: 'CT-3', status: 'Unknown', priority: 'High', dueDate: '2026-10-01' },
  ], now);

  assert.equal(metrics.overdueOpenIssues, 1);
  assert.equal(metrics.blockedOpenIssues, 1);
  assert.equal(metrics.agedOpenIssues, 1);
  assert.equal(metrics.missingPriorityIssues, 1);
  assert.equal(metrics.openIssuesMissingDueDate, 1);
  assert.equal(metrics.openIssuesMissingOwner, 2);
});

test('returns unknown, not zero, when there is no eligible delivery denominator', () => {
  const metrics = calculateDeliveryMetrics([], now);

  assert.equal(metrics.onTimeRate, null);
  assert.equal(metrics.eligibleResolvedIssues, 0);
  assert.equal(metrics.overdueOpenIssues, 0);
});

test('uses the most recently updated copy of a duplicated Jira issue', () => {
  const metrics = calculateDeliveryMetrics([
    { key: 'CT-1', status: 'In Progress', priority: 'High', updated: '2026-10-10', dueDate: '2026-10-20' },
    { key: 'CT-1', status: 'Done', priority: 'High', updated: '2026-10-20', dueDate: '2026-10-20', resolvedAt: '2026-10-20' },
  ], now);

  assert.equal(metrics.overdueOpenIssues, 0);
  assert.equal(metrics.eligibleResolvedIssues, 1);
  assert.equal(metrics.onTimeRate, 100);
});
