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
    };
  }>;
  isLast?: boolean;
  nextPageToken?: string;
}

export interface ConfluenceSearchResponse {
  results?: Array<{
    id: string;
    title: string;
    _links?: { webui?: string };
    space?: { name?: string; key?: string };
  }>;
  size?: number;
  start?: number;
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

export function mapJiraIssues(body: JiraSearchResponse): JiraIssueSummary[] {
  return (body.issues ?? []).map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? '',
    status: issue.fields?.status?.name ?? 'Unknown',
    priority: issue.fields?.priority?.name ?? 'Unset',
    project: issue.fields?.project?.name ?? 'Unknown',
    updated: issue.fields?.updated ?? '',
  }));
}

export function mapConfluencePages(body: ConfluenceSearchResponse): ConfluencePageSummary[] {
  return (body.results ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    space: page.space?.name ?? page.space?.key ?? 'Unknown',
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
