import type { BitbucketRepositorySummary, SourceResult } from '../shared/types.ts';
import { mapBitbucketRepositories, type BitbucketRepoResponse } from '../sync/normalise';
import { bitbucketAuthorizationHeaders } from './bitbucket-auth';
import { requestJson } from './http';

export async function fetchBitbucketRepositories(): Promise<SourceResult<BitbucketRepositorySummary>> {
  const env = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  const workspace = env?.BITBUCKET_WORKSPACE?.trim();
  const email = env?.BITBUCKET_ACCOUNT_EMAIL?.trim();
  const token = env?.BITBUCKET_API_TOKEN?.trim();
  if (!workspace || !email || !token) {
    return {
      data: [],
      status: {
        state: 'not-configured',
        count: 0,
        message: 'Set encrypted BITBUCKET_WORKSPACE, BITBUCKET_ACCOUNT_EMAIL, and BITBUCKET_API_TOKEN Forge variables.',
      },
    };
  }

  let nextUrl: string | undefined =
    `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(workspace)}?pagelen=100&sort=-updated_on`;
  const data: BitbucketRepositorySummary[] = [];

  while (nextUrl) {
    const pageUrl: URL = new URL(nextUrl);
    const body: BitbucketRepoResponse = await requestJson<BitbucketRepoResponse>(
      pageUrl,
      { headers: bitbucketAuthorizationHeaders(email, token) },
      {
        expectedHost: 'api.bitbucket.org',
        errorMessage:
          'Bitbucket returned an error. Check that the Atlassian account API token is active, has repository-read scope, and that the account can access this workspace.',
        redact: [token, email, Buffer.from(`${email}:${token}`).toString('base64')],
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
