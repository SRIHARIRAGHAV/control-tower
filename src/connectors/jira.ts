import api, { route } from '@forge/api';
import { buildJiraSearchJql } from '../backend/services/jira-query';
import type { JiraIssueSummary, SourceResult } from '../shared/types';
import { mapJiraIssues, type JiraCustomFieldIds, type JiraSearchResponse } from '../sync/normalise';
import { readProviderErrorDetail } from './http';

const CUSTOM_FIELD_NAMES: Record<keyof JiraCustomFieldIds, string> = {
  department: 'Department',
  impactedDepartment: 'Impacted department',
  client: 'Client',
  customerImpact: 'Customer impact',
  mitigation: 'Mitigation',
  owner: 'Owner',
  cooDecision: 'COO decision',
  cooApprover: 'COO approver',
  approvalDate: 'Approval date',
  deliveryInitiative: 'Delivery initiative',
};

interface JiraFieldDefinition {
  id: string;
  name: string;
}

async function fetchCustomFieldIds(): Promise<JiraCustomFieldIds> {
  const response = await api.asUser().requestJira(route`/rest/api/3/field`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const detail = await readProviderErrorDetail(response);
    throw new Error(
      `Jira field lookup returned HTTP ${response.status}${detail ? `: ${detail}` : ''}. Check the app's Jira scopes and project access.`,
    );
  }

  const fields = (await response.json()) as JiraFieldDefinition[];
  const customFieldIds: JiraCustomFieldIds = {};
  for (const [key, name] of Object.entries(CUSTOM_FIELD_NAMES) as Array<[keyof JiraCustomFieldIds, string]>) {
    const matches = fields
      .filter((field) => field.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
      .sort((left, right) => Number(right.id.startsWith('customfield_')) - Number(left.id.startsWith('customfield_')));
    const match = matches[0];
    if (match) customFieldIds[key] = match.id;
  }
  return customFieldIds;
}

export async function fetchJiraIssues(): Promise<SourceResult<JiraIssueSummary>> {
  const projectKey = process.env.JIRA_PROJECT_KEY?.trim();
  const jql = buildJiraSearchJql(projectKey);
  const customFields = await fetchCustomFieldIds();
  const requestedFields = [
    'summary',
    'status',
    'priority',
    'project',
    'updated',
    'created',
    'resolutiondate',
    'duedate',
    ...Object.values(customFields).filter((fieldId): fieldId is string => Boolean(fieldId)),
  ];
  const data: JiraIssueSummary[] = [];
  let nextPageToken: string | undefined;
  const seenPageTokens = new Set<string>();

  do {
    const response = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: requestedFields,
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
    data.push(...mapJiraIssues(body, customFields));
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
