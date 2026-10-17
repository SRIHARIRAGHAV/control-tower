import api, { route } from '@forge/api';
import type { AddJiraCommentInput, CreateJiraIssueInput } from '../shared/types';
import { readProviderErrorDetail } from '../connectors/http';

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
    const detail = await readProviderErrorDetail(response);
    throw new Error(
      `Jira issue creation failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}. Check project permissions and issue type settings.`,
    );
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
    const detail = await readProviderErrorDetail(response);
    throw new Error(
      `Jira comment creation failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}. Check issue permissions.`,
    );
  }
  return (await response.json()) as { id: string; self: string };
}
