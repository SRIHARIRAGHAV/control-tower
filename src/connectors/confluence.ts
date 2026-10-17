import api, { route } from '@forge/api';
import type { ConfluencePageSummary, SourceResult } from '../shared/types';
import { mapConfluencePages, type ConfluenceSearchResponse } from '../sync/normalise';

export async function fetchConfluencePages(): Promise<SourceResult<ConfluencePageSummary>> {
  const pageSize = 50;
  const data: ConfluencePageSummary[] = [];
  let start = 0;

  while (true) {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/search?cql=type=page%20ORDER%20BY%20lastmodified%20DESC&limit=${pageSize}&start=${start}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) {
      throw new Error(`Confluence returned HTTP ${response.status}. Check the app's Confluence scopes and access.`);
    }

    const body = (await response.json()) as ConfluenceSearchResponse;
    const pages = mapConfluencePages(body);
    data.push(...pages);
    if (!body._links?.next || pages.length === 0) break;
    start = (body.start ?? start) + (body.size ?? pages.length);
  }

  return {
    data,
    status: { state: 'connected', count: data.length, message: `Fetched ${data.length} Confluence pages.` },
  };
}
