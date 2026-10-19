import type { JiraIssueSummary, XoneSnapshot } from '../shared/types';

export type RiskLevel = 'urgent' | 'high' | 'monitor';

export interface JiraRiskIndicator {
  issue: JiraIssueSummary;
  level: RiskLevel;
  reasons: string[];
}

export interface LiveRiskAnalysis {
  jiraIssueCount: number;
  openIssueCount: number;
  blockedIssueCount: number;
  highPriorityIssueCount: number;
  indicators: JiraRiskIndicator[];
  totalSourceRecords: number;
}

const completedStatuses = new Set(['done', 'closed', 'resolved', 'complete', 'completed']);
const urgentPriorities = new Set(['blocker', 'critical', 'highest']);

export function analyzeLiveSources(snapshot: XoneSnapshot): LiveRiskAnalysis {
  const indicators = snapshot.jiraIssues.flatMap((issue): JiraRiskIndicator[] => {
    const status = issue.status.trim().toLowerCase();
    const priority = issue.priority.trim().toLowerCase();
    if (completedStatuses.has(status)) return [];

    const reasons: string[] = [];
    if (status.includes('block')) reasons.push(`Status is ${issue.status}`);
    if (urgentPriorities.has(priority)) reasons.push(`Priority is ${issue.priority}`);
    else if (priority === 'high') reasons.push('Priority is High');

    if (reasons.length === 0) return [];

    const level: RiskLevel = status.includes('block') || urgentPriorities.has(priority)
      ? 'urgent'
      : 'high';

    return [{ issue, level, reasons }];
  });

  const openIssueCount = snapshot.jiraIssues.filter(
    ({ status }) => !completedStatuses.has(status.trim().toLowerCase()),
  ).length;

  return {
    jiraIssueCount: snapshot.jiraIssues.length,
    openIssueCount,
    blockedIssueCount: indicators.filter(({ reasons }) =>
      reasons.some((reason) => reason.startsWith('Status is')),
    ).length,
    highPriorityIssueCount: indicators.filter(({ reasons }) =>
      reasons.some((reason) => reason.startsWith('Priority is')),
    ).length,
    indicators,
    totalSourceRecords:
      snapshot.jiraIssues.length +
      snapshot.confluencePages.length +
      snapshot.bitbucketRepositories.length,
  };
}
