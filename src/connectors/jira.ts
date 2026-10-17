import api, { route } from '@forge/api';
import type { JiraIssueSummary, SourceResult } from '../shared/types';
import { mapJiraIssues, type JiraSearchResponse } from '../sync/normalise';
import { readProviderErrorDetail } from './http';

export async function fetchJiraIssues(): Promise<SourceResult<JiraIssueSummary>> {
  const data: JiraIssueSummary[] = [];
  let nextPageToken: string | undefined;
  const seenPageTokens = new Set<string>();

  do {
    const response = await api.asApp().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: 'project in projectsWhereUserHasPermission() ORDER BY updated DESC',
        maxResults: 100,
        fields: ['summary', 'status', 'priority', 'project', 'updated'],
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
    if (!response.ok) {
      const detail = await readProviderErrorDetail(response);
      throw new Error(
        `Jira returned HTTP ${response.status}${detail ? `: ${detail}` : ''}. Check the app's Jira scopes and project access.`,
      );
    }

    const body = (await response.json()) as JiraSearchResponse;
    data.push(...mapJiraIssues(body));
    if (body.isLast || !body.nextPageToken) break;
    if (seenPageTokens.has(body.nextPageToken)) {
      throw new Error('Jira returned a repeated pagination token; stopping sync to avoid an infinite loop.');
    }
    seenPageTokens.add(body.nextPageToken);
    nextPageToken = body.nextPageToken;
  } while (nextPageToken);

  return {
    data,
    status: { state: 'connected', count: data.length, message: `Fetched ${data.length} Jira issues.` },
  };
}
