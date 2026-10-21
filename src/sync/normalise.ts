
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
    _links?: { webui?: string };
    version?: { createdAt?: string };
    createdAt?: string;
    modifiedAt?: string;
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

function normalizeText(value: unknown): string | undefined {
  if (value == null) return undefined;

  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text || undefined;
  }

  if (Array.isArray(value)) {
    const values = value
      .map(normalizeText)
      .filter((item): item is string => Boolean(item));

    return values.length ? values.join(', ') : undefined;
  }

  if (typeof value === 'object') {
    const field = value as Record<string, unknown>;

    for (const key of [
      'displayName',
      'value',
      'name',
      'text',
      'emailAddress',
    ]) {
      const text = normalizeText(field[key]);
      if (text) return text;
    }

    if (Array.isArray(field.content)) {
      const text = field.content
        .map(normalizeText)
        .filter((item): item is string => Boolean(item))
        .join(' ');

      if (text) return text;
    }
  }

  return undefined;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed || undefined;
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
  return trimmed || 'Unset';
}

export function mapJiraIssues(
  body: JiraSearchResponse,
  customFields: JiraCustomFieldIds = {},
): JiraIssueSummary[] {
  return (body.issues ?? []).map((issue) => {
    const fields = issue.fields ?? {};

    return {
      key: issue.key,
      summary: fields.summary ?? '',
      status: normalizeJiraStatus(fields.status?.name),
      priority: normalizePriority(fields.priority?.name),
      project: fields.project?.name ?? 'Unknown',
      updated: fields.updated ?? '',
      createdAt: normalizeDate(fields.created),
      resolvedAt: normalizeDate(fields.resolutiondate),
      dueDate: normalizeDate(fields.duedate),

      department: customFields.department
        ? normalizeText(fields[customFields.department])
        : undefined,

      impactedDepartment: customFields.impactedDepartment
        ? normalizeText(fields[customFields.impactedDepartment])
        : undefined,

      client: customFields.client
        ? normalizeText(fields[customFields.client])
        : undefined,

      customerImpact: customFields.customerImpact
        ? normalizeText(fields[customFields.customerImpact])
        : undefined,

      mitigation: customFields.mitigation
        ? normalizeText(fields[customFields.mitigation])
        : undefined,

      impactArea: customFields.impactArea
        ? normalizeText(fields[customFields.impactArea])
        : undefined,

      owner: customFields.owner
        ? normalizeText(fields[customFields.owner])
        : undefined,

      cooDecision: customFields.cooDecision
        ? normalizeText(fields[customFields.cooDecision])
        : undefined,

      cooApprover: customFields.cooApprover
        ? normalizeText(fields[customFields.cooApprover])
        : undefined,

      approvalDate: customFields.approvalDate
        ? normalizeDate(fields[customFields.approvalDate])
        : undefined,

      deliveryInitiative: customFields.deliveryInitiative
        ? normalizeText(fields[customFields.deliveryInitiative])
        : undefined,
    };
  });
}

export function mapConfluencePages(
  body: ConfluencePagesResponse,
): ConfluencePageSummary[] {
  return (body.results ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    space: page.spaceId ?? 'Unknown',
    url: page._links?.webui ?? '',
    lastModified:
      page.modifiedAt ?? page.version?.createdAt ?? page.createdAt,
  }));
}

export function mapBitbucketRepositories(
  body: BitbucketRepoResponse,
): BitbucketRepositorySummary[] {
  return (body.values ?? []).map((repository) => ({
    name: repository.name,
    fullName: repository.full_name,
    url: repository.links?.html?.href ?? '',
    updated: repository.updated_on ?? '',
  }));
}

export function mapBitbucketCommits(
  body: BitbucketCommitsResponse,
): NonNullable<BitbucketRepositorySummary['recentCommits']> {
  return (body.values ?? []).map((commit) => ({
    hash: commit.hash,
    message: commit.message ?? '',
    author: commit.author?.raw ?? 'Unknown author',
    date: commit.date ?? '',
    url: commit.links?.html?.href ?? '',
  }));
}
