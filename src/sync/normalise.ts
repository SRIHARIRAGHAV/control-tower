import type {
  BitbucketRepositorySummary,
  ConfluencePageSummary,
  JiraIssueSummary,
} from '../shared/types.ts';

export interface JiraSearchResponse {
  issues?: Array<{
    key: string;
    fields?: {
      summary?: string;
      status?: { name?: string };
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
  owner?: string;
  cooDecision?: string;
  cooApprover?: string;
  approvalDate?: string;
}

export interface ConfluencePagesResponse {
  results?: Array<{
    id: string;
    title: string;
    spaceId?: string;
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

function jiraFieldText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const values = value.map(jiraFieldText).filter((item): item is string => Boolean(item));
    return values.length ? values.join(' ') : undefined;
  }
  if (value && typeof value === 'object') {
    const field = value as Record<string, unknown>;
    for (const key of ['displayName', 'value', 'name', 'text', 'content']) {
      const text = jiraFieldText(field[key]);
      if (text) return text;
    }
  }
  return undefined;
}

export function mapJiraIssues(body: JiraSearchResponse, customFields: JiraCustomFieldIds = {}): JiraIssueSummary[] {
  return (body.issues ?? []).map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? '',
    status: issue.fields?.status?.name ?? 'Unknown',
    priority: issue.fields?.priority?.name ?? 'Unset',
    project: issue.fields?.project?.name ?? 'Unknown',
    updated: issue.fields?.updated ?? '',
    createdAt: issue.fields?.created,
    resolvedAt: issue.fields?.resolutiondate ?? undefined,
    dueDate: jiraFieldText(issue.fields?.duedate),
    department: customFields.department ? jiraFieldText(issue.fields?.[customFields.department]) : undefined,
    impactedDepartment: customFields.impactedDepartment ? jiraFieldText(issue.fields?.[customFields.impactedDepartment]) : undefined,
    client: customFields.client ? jiraFieldText(issue.fields?.[customFields.client]) : undefined,
    customerImpact: customFields.customerImpact ? jiraFieldText(issue.fields?.[customFields.customerImpact]) : undefined,
    mitigation: customFields.mitigation ? jiraFieldText(issue.fields?.[customFields.mitigation]) : undefined,
    owner: customFields.owner ? jiraFieldText(issue.fields?.[customFields.owner]) : undefined,
    cooDecision: customFields.cooDecision ? jiraFieldText(issue.fields?.[customFields.cooDecision]) : undefined,
    cooApprover: customFields.cooApprover ? jiraFieldText(issue.fields?.[customFields.cooApprover]) : undefined,
    approvalDate: customFields.approvalDate ? jiraFieldText(issue.fields?.[customFields.approvalDate]) : undefined,
  }));
}

export function mapConfluencePages(body: ConfluencePagesResponse): ConfluencePageSummary[] {
  return (body.results ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    space: page.spaceId ?? 'Unknown',
    url: page._links?.webui ?? '',
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
