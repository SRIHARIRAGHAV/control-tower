import type { RiskForecast } from '../forecast/risk-forecast';

export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  statusCategory?: string;
  priority: string;
  project: string;
  updated: string;
  createdAt?: string;
  resolvedAt?: string;
  reopenedAt?: string[];
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

export interface BitbucketPullRequestSummary {
  id: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED';
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
}

export interface BitbucketPipelineSummary {
  createdAt: string;
  result: 'SUCCESSFUL' | 'FAILED' | 'OTHER';
}

export interface BitbucketRepositorySummary {
  name: string;
  fullName: string;
  url: string;
  updated: string;
  recentCommits?: BitbucketCommitSummary[];
  pullRequests?: BitbucketPullRequestSummary[];
  pipelines?: BitbucketPipelineSummary[];
}

export interface SourceStatus {
  state: 'connected' | 'partial' | 'not-configured' | 'error' | 'not-synced';
  count: number;
  syncedAt?: string;
  message: string;
  missingFields?: string[];
  ambiguousFields?: string[];
  resolvedFieldIds?: string[];
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
