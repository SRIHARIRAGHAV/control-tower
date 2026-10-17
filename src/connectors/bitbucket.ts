import type { BitbucketRepositorySummary, SourceResult } from '../shared/types.ts';
import { mapBitbucketRepositories, type BitbucketRepoResponse } from '../sync/normalise';
import { bitbucketAuthorizationHeaders } from './bitbucket-auth';
import { requestJson } from './http';

export async function fetchBitbucketRepositories(): Promise<SourceResult<BitbucketRepositorySummary>> {
  const env = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  const workspace = env?.BITBUCKET_WORKSPACE?.trim();
  const token = env?.BITBUCKET_WORKSPACE_ACCESS_TOKEN?.trim();
  if (!workspace || !token) {
    return {
      data: [],
      status: {
        state: 'not-configured',
        count: 0,
        message:
          'Set encrypted BITBUCKET_WORKSPACE and BITBUCKET_WORKSPACE_ACCESS_TOKEN Forge variables. The workspace access token needs repository read permission.',
      },
    };
  }

  let nextUrl: string | undefined =
    `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(workspace)}?pagelen=100&sort=-updated_on`;
  const data: BitbucketRepositorySummary[] = [];
  const seenPageUrls = new Set<string>();

  while (nextUrl) {
    if (seenPageUrls.has(nextUrl)) {
      throw new Error('Bitbucket returned a repeated pagination URL; stopping sync to avoid an infinite loop.');
    }
    seenPageUrls.add(nextUrl);
    const pageUrl: URL = new URL(nextUrl);
    const body: BitbucketRepoResponse = await requestJson<BitbucketRepoResponse>(
      pageUrl,
      { headers: bitbucketAuthorizationHeaders(token), redirect: 'error' },
      {
        expectedHost: 'api.bitbucket.org',
        errorMessage:
          'Bitbucket returned an error. Check that the workspace access token is active, has repository read permission, and belongs to this workspace.',
        redact: [token],
      },
    );
    data.push(...mapBitbucketRepositories(body));
    nextUrl = body.next;
  }

  return {
    data,
    status: { state: 'connected', count: data.length, message: `Fetched ${data.length} Bitbucket repositories.` },
  };
}
