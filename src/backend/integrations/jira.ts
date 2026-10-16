import api, { route } from '@forge/api';
import type {
  AddJiraCommentInput,
  CreateJiraIssueInput,
  JiraIssueSummary,
  SourceResult,
} from '../../domain/contracts';

interface JiraSearchResponse {
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
}

export async function fetchJiraIssues(): Promise<SourceResult<JiraIssueSummary>> {
  const response = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: 'ORDER BY updated DESC',
      maxResults: 100,
      fields: ['summary', 'status', 'priority', 'project', 'updated'],
    }),
  });
  if (!response.ok) {
    throw new Error(`Jira returned HTTP ${response.status}. Check the app's Jira scopes and project access.`);
  }

  const body = (await response.json()) as JiraSearchResponse;
  const data = (body.issues ?? []).map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? '',
    status: issue.fields?.status?.name ?? 'Unknown',
    priority: issue.fields?.priority?.name ?? 'Unset',
    project: issue.fields?.project?.name ?? 'Unknown',
    updated: issue.fields?.updated ?? '',
  }));
  return {
    data,
    status: { state: 'connected', count: data.length, message: `Fetched ${data.length} Jira issues.` },
  };
}

function toAdf(text: string) {
  return {
    version: 1,
    type: 'doc',
    content: text
      ? text.split(/\r?\n/).map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        }))
      : [],
  };
}

export async function createJiraIssue(input: CreateJiraIssueInput): Promise<{ id: string; key: string; self: string }> {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: input.projectKey },
        summary: input.summary,
        description: toAdf(input.description ?? ''),
        issuetype: { name: 'Task' },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Jira issue creation failed with HTTP ${response.status}. Check project permissions and issue type settings.`);
  }
  return (await response.json()) as { id: string; key: string; self: string };
}

export async function addJiraComment(input: AddJiraCommentInput): Promise<{ id: string; self: string }> {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${input.issueKey}/comment`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: toAdf(input.body) }),
  });
  if (!response.ok) {
    throw new Error(`Jira comment creation failed with HTTP ${response.status}. Check issue permissions.`);
  }
  return (await response.json()) as { id: string; self: string };
}
