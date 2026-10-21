import type {
  BitbucketRepositorySummary,
  ConfluencePageSummary,
  JiraIssueSummary,
} from '../shared/types';

export interface JiraSearchResponse {
  issues?: Array<{
    key: string;
    fields?: {
      summary?: string;
      status?: { name?: string; statusCategory?: { key?: string } };
      priority?: { name?: string };
      project?: { name?: string };
      updated?: string;
      created?: string;
      resolutiondate?: string | null;
      duedate?: string;
      [fieldId: string]: unknown;
    };
  }>;
  isLast?: boolean;
  nextPageToken?: string;
}

export interface JiraCustomFieldIds {
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

export interface ConfluencePagesResponse {
  results?: Array<{
    id: string;
    title: string;
    spaceId?: string;
    version?: { createdAt?: string };
    _links?: { webui?: string };
  }>;
  _links?: { next?: string };
}

export interface BitbucketRepoResponse {
  values?: Array<{
    name: string;
    full_name: string;
    links?: { html?: { href?: string } };
    updated_on?: string;
  }>;
  next?: string;
}

export interface BitbucketCommitsResponse {
  values?: Array<{
    hash: string;
    message?: string;
    date?: string;
    author?: { raw?: string };
    links?: { html?: { href?: string } };
  }>;
}

export interface BitbucketPullRequestsResponse {
  values?: Array<{
    id: number;
    state: string;
    created_on?: string;
    updated_on?: string;
  }>;
  next?: string;
}

export interface BitbucketPipelinesResponse {
  values?: Array<{
    created_on?: string;
    state?: { result?: { name?: string } };
  }>;
  next?: string;
}

function normalizeText(value: unknown): string | undefined {
  if (value == null) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const values = value.map(normalizeText).filter((item): item is string => Boolean(item));
    return values.length ? values.join(' ') : undefined;
  }
  if (value && typeof value === 'object') {
    const field = value as Record<string, unknown>;
    for (const key of ['displayName', 'value', 'name', 'text', 'content']) {
      const text = normalizeText(field[key]);
      if (text) return text;
    }

    if (Array.isArray(field.content)) {
      const nested = field.content.map(normalizeText).filter((item): item is string => Boolean(item));
      if (nested.length) return nested.join(' ');
    }
  }
  return undefined;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

const jiraStatusMap: Record<string, string> = {
  blocked: 'Blocked',
  'in progress': 'In Progress',
  'to do': 'To Do',
  monitoring: 'In Progress',
  'at risk': 'In Progress',
  open: 'To Do',
  'waiting on approval': 'In Progress',
  'waiting for approval': 'In Progress',
  done: 'Done',
  resolved: 'Done',
  closed: 'Done',
  complete: 'Done',
  completed: 'Done',
};

function normalizeJiraStatus(value: string | undefined): string {
  if (!value) return 'Unknown';
  const trimmed = value.trim();
  return jiraStatusMap[trimmed.toLowerCase()] ?? trimmed;
}

function normalizePriority(value: string | undefined): string {
  if (!value) return 'Unset';
  const trimmed = value.trim();
  return trimmed.length ? trimmed : 'Unset';
}

export function mapJiraIssues(body: JiraSearchResponse, customFields: JiraCustomFieldIds = {}): JiraIssueSummary[] {
  return (body.issues ?? []).map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? '',
    status: normalizeJiraStatus(issue.fields?.status?.name),
    statusCategory: issue.fields?.status?.statusCategory?.key,
    priority: normalizePriority(issue.fields?.priority?.name),
    project: issue.fields?.project?.name ?? 'Unknown',
    updated: issue.fields?.updated ?? '',
    createdAt: normalizeDate(issue.fields?.created),
    resolvedAt: normalizeDate(issue.fields?.resolutiondate ?? undefined),
    dueDate: normalizeDate(issue.fields?.duedate),
    department: customFields.department ? normalizeText(issue.fields?.[customFields.department]) : undefined,
    impactedDepartment: customFields.impactedDepartment ? normalizeText(issue.fields?.[customFields.impactedDepartment]) : undefined,
    client: customFields.client ? normalizeText(issue.fields?.[customFields.client]) : undefined,
    customerImpact: customFields.customerImpact ? normalizeText(issue.fields?.[customFields.customerImpact]) : undefined,
    mitigation: customFields.mitigation ? normalizeText(issue.fields?.[customFields.mitigation]) : undefined,
    impactArea: customFields.impactArea ? normalizeText(issue.fields?.[customFields.impactArea]) : undefined,
    owner: customFields.owner ? normalizeText(issue.fields?.[customFields.owner]) : undefined,
    cooDecision: customFields.cooDecision ? normalizeText(issue.fields?.[customFields.cooDecision]) : undefined,
    cooApprover: customFields.cooApprover ? normalizeText(issue.fields?.[customFields.cooApprover]) : undefined,
    approvalDate: customFields.approvalDate ? normalizeDate(issue.fields?.[customFields.approvalDate]) : undefined,
    deliveryInitiative: customFields.deliveryInitiative
      ? normalizeText(issue.fields?.[customFields.deliveryInitiative])
      : undefined,
  }));
}

export function mapConfluencePages(body: ConfluencePagesResponse): ConfluencePageSummary[] {
  return (body.results ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    space: page.spaceId ?? 'Unknown',
    url: page._links?.webui ?? '',
    lastModified: normalizeDate(page.version?.createdAt),
  }));
}

export function mapBitbucketRepositories(body: BitbucketRepoResponse): BitbucketRepositorySummary[] {
  return (body.values ?? []).map((repository) => ({
    name: repository.name,
    fullName: repository.full_name,
    url: repository.links?.html?.href ?? '',
    updated: repository.updated_on ?? '',
  }));
}

export function mapBitbucketCommits(body: BitbucketCommitsResponse): NonNullable<BitbucketRepositorySummary['recentCommits']> {
  return (body.values ?? []).map((commit) => ({
    hash: commit.hash,
    message: commit.message ?? '',
    author: commit.author?.raw ?? 'Unknown author',
    date: commit.date ?? '',
    url: commit.links?.html?.href ?? '',
  }));
}

export function mapBitbucketPullRequests(
  body: BitbucketPullRequestsResponse,
): NonNullable<BitbucketRepositorySummary['pullRequests']> {
  return (body.values ?? []).flatMap((pullRequest) => {
    if (!['OPEN', 'MERGED', 'DECLINED'].includes(pullRequest.state)) return [];
    return [{
      id: String(pullRequest.id),
      state: pullRequest.state as 'OPEN' | 'MERGED' | 'DECLINED',
      createdAt: pullRequest.created_on ?? '',
      updatedAt: pullRequest.updated_on ?? '',
    }];
  });
}

export function mapBitbucketPipelines(
  body: BitbucketPipelinesResponse,
): NonNullable<BitbucketRepositorySummary['pipelines']> {
  return (body.values ?? []).map((pipeline) => {
    const result = pipeline.state?.result?.name?.toUpperCase();
    return {
      createdAt: pipeline.created_on ?? '',
      result: result === 'SUCCESSFUL' ? 'SUCCESSFUL' : result === 'FAILED' ? 'FAILED' : 'OTHER',
    };
  });
}
