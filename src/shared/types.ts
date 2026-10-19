export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  priority: string;
  project: string;
  updated: string;
  createdAt?: string;
  dueDate?: string;
  department?: string;
  impactedDepartment?: string;
  client?: string;
  customerImpact?: string;
  mitigation?: string;
  owner?: string;
  cooDecision?: string;
  cooApprover?: string;
  approvalDate?: string;
}

export interface ConfluencePageSummary {
  id: string;
  title: string;
  space: string;
  url: string;
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
}

export interface SourceStatus {
  state: 'connected' | 'not-configured' | 'error' | 'not-synced';
  count: number;
  syncedAt?: string;
  message: string;
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
