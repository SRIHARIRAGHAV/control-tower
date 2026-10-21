import type { RiskForecast } from '../forecast/risk-forecast';

export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  priority: string;
  project: string;
  updated: string;
  createdAt?: string;
  resolvedAt?: string;
  dueDate?: string;
  department?: string;
  impactedDepartment?: string;
  client?: string;
  customerImpact?: string;
  mitigation?: string;
  impactArea?: string;
  owner?: string;
  cooDecision?: string;
  cooApprover?: string;
  approvalDate?: string;
  deliveryInitiative?: string;
  reopenedAt?: string[];
}

export interface ConfluencePageSummary {
  id: string;
  title: string;
  space: string;
  url: string;
  lastModified?: string;
}

export interface BitbucketCommitSummary {
  hash: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface BitbucketRepositorySummary {
  name: string;
  fullName: string;
  url: string;
  updated: string;
  recentCommits?: BitbucketCommitSummary[];
  pullRequests?: { createdAt: string; mergedAt?: string; state: 'OPEN' | 'MERGED' | 'DECLINED' }[];
  pipelines?: { createdAt: string; result: 'SUCCESSFUL' | 'FAILED' | 'OTHER' }[];
}

export interface SourceStatus {
  state: 'connected' | 'partial' | 'not-configured' | 'error' | 'not-synced';
  count: number;
  syncedAt?: string;
  message: string;
  missingFields?: string[];
}

export interface XoneSnapshot {
  jiraIssues: JiraIssueSummary[];
  confluencePages: ConfluencePageSummary[];
  bitbucketRepositories: BitbucketRepositorySummary[];
  syncedAt: string;
}

export interface SyncState {
  jira: SourceStatus;
  confluence: SourceStatus;
  bitbucket: SourceStatus;
  syncedAt?: string;
}

export interface DashboardDataResponse {
  snapshot: XoneSnapshot | null;
  state: SyncState;
  forecast?: RiskForecast;
}

export interface CreateJiraIssueInput {
  projectKey: string;
  summary: string;
  description?: string;
}

export interface AddJiraCommentInput {
  issueKey: string;
  body: string;
}

export interface SourceResult<T> {
  data: T[];
  status: SourceStatus;
}
