import api, { route } from '@forge/api';
import type { ConfluencePageSummary, SourceResult } from '../shared/types';
import { mapConfluencePages, type ConfluencePagesResponse } from '../sync/normalise';
import { readProviderErrorDetail } from './http';

export async function fetchConfluencePages(): Promise<SourceResult<ConfluencePageSummary>> {
  const pageSize = 100;
  const pagesById = new Map<string, ConfluencePageSummary>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const query = new URLSearchParams({
      limit: String(pageSize),
      sort: '-modified-date',
      status: 'current',
      ...(cursor ? { cursor } : {}),
    });
    const response = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages?${query}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!response.ok) {
      const detail = await readProviderErrorDetail(response);
      throw new Error(
        `Confluence returned HTTP ${response.status}${detail ? `: ${detail}` : ''}. Check the app's Confluence scopes and access.`,
      );
    }

    const body = (await response.json()) as ConfluencePagesResponse;
    const pages = mapConfluencePages(body);
    for (const page of pages) pagesById.set(page.id, page);
    const next = body._links?.next;
    if (!next || pages.length === 0) break;
    const nextCursor = new URL(next, 'https://confluence.invalid').searchParams.get('cursor');
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error('Confluence returned a missing or repeated pagination cursor; stopping sync.');
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  const data = [...pagesById.values()];
  return {
    data,
    status: { state: 'connected', count: data.length, message: `Fetched metadata for ${data.length} unique Confluence pages; page content was not analyzed.` },
  };
}
