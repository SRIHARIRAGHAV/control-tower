import api, { route } from '@forge/api';
import type { ConfluencePageSummary, SourceResult } from '../../domain/contracts';

interface ConfluenceSearchResponse {
  results?: Array<{
    id: string;
    title: string;
    _links?: { webui?: string };
    space?: { name?: string; key?: string };
  }>;
}

export async function fetchConfluencePages(): Promise<SourceResult<ConfluencePageSummary>> {
  const response = await api.asApp().requestConfluence(
    route`/wiki/rest/api/content/search?cql=type=page%20ORDER%20BY%20lastmodified%20DESC&limit=50`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) {
    throw new Error(`Confluence returned HTTP ${response.status}. Check the app's Confluence scopes and access.`);
  }

  const body = (await response.json()) as ConfluenceSearchResponse;
  const data = (body.results ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    space: page.space?.name ?? page.space?.key ?? 'Unknown',
    url: page._links?.webui ?? '',
  }));
  return {
    data,
    status: { state: 'connected', count: data.length, message: `Fetched ${data.length} Confluence pages.` },
  };
}
