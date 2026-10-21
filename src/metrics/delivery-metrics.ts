import type { JiraIssueSummary } from '../shared/types';

export interface DeliveryMetrics {
  eligibleResolvedIssues: number;
  onTimeResolvedIssues: number;
  onTimeRate: number | null;
  overdueOpenIssues: number;
  blockedOpenIssues: number;
  agedOpenIssues: number;
  missingPriorityIssues: number;
  openIssuesMissingDueDate: number;
  openIssuesMissingOwner: number;
}

const DONE_STATUS = /^(done|closed|resolved|complete|completed)$/i;
const UNKNOWN_STATUS = /^(unknown|unset)$/i;
function dateOnly(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const normalized = date.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && normalized !== value) return null;
  return normalized;
}

function uniqueIssues(issues: JiraIssueSummary[]): JiraIssueSummary[] {
  const byKey = new Map<string, JiraIssueSummary>();
  for (const issue of issues) {
    const existing = byKey.get(issue.key);
    if (!existing || (dateOnly(issue.updated) ?? '') >= (dateOnly(existing.updated) ?? '')) {
      byKey.set(issue.key, issue);
    }
  }
  return [...byKey.values()];
}

export function calculateDeliveryMetrics(
  issues: JiraIssueSummary[],
  now = new Date(),
): DeliveryMetrics {
  const today = now.toISOString().slice(0, 10);
  const windowStart = new Date(now);
  windowStart.setUTCHours(0, 0, 0, 0);
  windowStart.setUTCDate(windowStart.getUTCDate() - 29);
  const firstDay = windowStart.toISOString().slice(0, 10);
  const agedBefore = new Date(now);
  agedBefore.setUTCHours(0, 0, 0, 0);
  agedBefore.setUTCDate(agedBefore.getUTCDate() - 7);
  const agedBeforeDate = agedBefore.toISOString().slice(0, 10);

  let eligibleResolvedIssues = 0;
  let onTimeResolvedIssues = 0;
  let overdueOpenIssues = 0;
  let blockedOpenIssues = 0;
  let agedOpenIssues = 0;
  let missingPriorityIssues = 0;
  let openIssuesMissingDueDate = 0;
  let openIssuesMissingOwner = 0;

  for (const issue of uniqueIssues(issues)) {
    const status = issue.status.trim();
    const statusKnown = Boolean(status) && !UNKNOWN_STATUS.test(status);
    const resolvedDate = dateOnly(issue.resolvedAt);
    const dueDate = dateOnly(issue.dueDate);
    const createdDate = dateOnly(issue.createdAt);
    const priority = issue.priority.trim();
    const isOpen = statusKnown && !DONE_STATUS.test(status);

    if (!priority || /^(unknown|unset)$/i.test(priority)) missingPriorityIssues++;

    if (isOpen) {
      if (!dueDate) openIssuesMissingDueDate++;
      else if (dueDate < today) overdueOpenIssues++;
      if (/block/i.test(status)) blockedOpenIssues++;
      if (!issue.owner?.trim()) openIssuesMissingOwner++;
      if (createdDate && createdDate < agedBeforeDate) agedOpenIssues++;
    }

    if (DONE_STATUS.test(status) && resolvedDate && dueDate && resolvedDate >= firstDay && resolvedDate <= today) {
      eligibleResolvedIssues++;
      if (resolvedDate <= dueDate) onTimeResolvedIssues++;
    }
  }

  return {
    eligibleResolvedIssues,
    onTimeResolvedIssues,
    onTimeRate: eligibleResolvedIssues
      ? Math.round((onTimeResolvedIssues / eligibleResolvedIssues) * 100)
      : null,
    overdueOpenIssues,
    blockedOpenIssues,
    agedOpenIssues,
    missingPriorityIssues,
    openIssuesMissingDueDate,
    openIssuesMissingOwner,
  };
}
