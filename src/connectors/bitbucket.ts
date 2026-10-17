import type { BitbucketRepositorySummary, SourceResult } from '../shared/types.ts';
import { mapBitbucketRepositories, type BitbucketRepoResponse } from '../sync/normalise';
import { fetchBitbucketAccessToken } from './bitbucket-auth';
import { requestJson } from './http';

export async function fetchBitbucketRepositories(): Promise<SourceResult<BitbucketRepositorySummary>> {
  const env = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  const workspace = env?.BITBUCKET_WORKSPACE?.trim();
  const clientId = env?.BITBUCKET_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env?.BITBUCKET_OAUTH_CLIENT_SECRET?.trim();
  if (!workspace || !clientId || !clientSecret) {
    return {
      data: [],
      status: {
        state: 'not-configured',
        count: 0,
        message:
          'Set encrypted BITBUCKET_WORKSPACE, BITBUCKET_OAUTH_CLIENT_ID, and BITBUCKET_OAUTH_CLIENT_SECRET Forge variables. Configure the OAuth consumer with repository read permission.',
      },
    };
  }
  const token = await fetchBitbucketAccessToken(clientId, clientSecret);

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
      {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        redirect: 'error',
      },
      {
        expectedHost: 'api.bitbucket.org',
        errorMessage:
          'Bitbucket returned an error. Check that the OAuth consumer has repository read permission and that the configured workspace is accessible.',
        redact: [token, clientId, clientSecret],
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
