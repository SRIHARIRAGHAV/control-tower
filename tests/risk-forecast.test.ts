import { describe, expect, it } from 'vitest';
import { buildRiskForecast, forecastDelivery, type ForecastIssue } from '../src/forecast/risk-forecast';

function resolvedIssues(now: Date): ForecastIssue[] {
  return Array.from({ length: 15 }, (_, index) => {
    const resolved = new Date(now.getTime() - (20 + index) * 86_400_000);
    const created = new Date(resolved.getTime() - (index + 1) * 86_400_000);
    return {
      key: `KAN-${index + 1}`,
      project: 'Kanban',
      status: 'Done',
      priority: 'Medium',
      createdAt: created.toISOString(),
      resolvedAt: resolved.toISOString(),
    };
  });
}

describe('risk forecast', () => {
  const now = new Date('2026-10-20T00:00:00.000Z');

  it('uses only valid, recent, completed issues for cycle-time history', () => {
    const inputs: ForecastIssue[] = Array.from({ length: 15 }, (_, index) => ({
      key: `KAN-${index + 1}`,
      project: 'Kanban',
      status: 'Done',
      priority: 'Medium',
      createdAt: '2026-10-01T00:00:00.000Z',
      resolvedAt: index === 0 ? 'invalid' : '2026-10-21T00:00:00.000Z',
    }));

    expect(forecastDelivery(inputs, now)).toMatchObject({
      status: 'insufficient-data',
      have: 0,
      need: 15,
    });
  });

  it('does not count already-overdue issues as future delivery windows', () => {
    const issues = resolvedIssues(now);
    issues.push({
      key: 'KAN-100',
      project: 'Kanban',
      status: 'In Progress',
      priority: 'High',
      createdAt: '2026-10-18T00:00:00.000Z',
      dueDate: '2026-10-23T00:00:00.000Z',
    });
    issues.push({
      key: 'KAN-101',
      project: 'Kanban',
      status: 'To Do',
      priority: 'High',
      createdAt: '2026-10-10T00:00:00.000Z',
      dueDate: '2026-10-17T00:00:00.000Z',
    });

    const forecast = forecastDelivery(issues, now);
    expect(forecast).toMatchObject({ status: 'ready' });
    if (forecast.status === 'ready') {
      expect(forecast.windows[0].issuesDue).toBe(1);
      expect(forecast.windows[1].issuesDue).toBe(1);
      expect(forecast.windows[2].issuesDue).toBe(1);
    }
  });

  it('returns insufficient-data for signals whose history is not synced', () => {
    const forecast = buildRiskForecast({
      issues: [],
      repos: [{ fullName: 'workspace/repository' }],
      pages: [{ title: 'Architecture decision record' }],
    }, now);

    expect(forecast.potentialRisks.status).toBe('insufficient-data');
    expect(forecast.anomalies.status).toBe('insufficient-data');
  });
});
