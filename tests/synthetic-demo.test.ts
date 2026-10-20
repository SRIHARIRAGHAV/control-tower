import { describe, expect, it } from 'vitest';
import { syntheticDemoIssues, syntheticDemoSummary, syntheticDemoSnapshot } from '../src/data/synthetic-demo';

describe('synthetic demo dataset', () => {
  it('contains a coherent 80-100 issue seed across multiple delivery initiatives', () => {
    expect(syntheticDemoIssues.length).toBeGreaterThanOrEqual(80);
    expect(syntheticDemoIssues.length).toBeLessThanOrEqual(100);
    expect(syntheticDemoSummary.totalIssues).toBe(syntheticDemoIssues.length);
    expect(new Set(syntheticDemoIssues.map((issue) => issue.key)).size).toBe(syntheticDemoIssues.length);
  });

  it('keeps initiative names distinct from the Jira project container and covers cross-department contexts', () => {
    const initiatives = new Set(syntheticDemoIssues.map((issue) => issue.project));
    expect(initiatives.size).toBeGreaterThan(1);
    expect(syntheticDemoSnapshot.jiraIssues.some((issue) => issue.project.includes('Portal'))).toBe(true);
    expect(syntheticDemoIssues.some((issue) => issue.department !== issue.impactedDepartment)).toBe(true);
  });

  it('includes pending approvals and customer impact evidence for COO dashboard review', () => {
    const pendingApprovals = syntheticDemoIssues.filter((issue) => issue.cooDecision === 'Pending');
    expect(pendingApprovals.length).toBeGreaterThan(0);
    expect(syntheticDemoIssues.some((issue) => issue.customerImpact && issue.customerImpact.length > 20)).toBe(true);
    expect(syntheticDemoSummary.pendingApprovals).toBe(pendingApprovals.length);
  });
});
