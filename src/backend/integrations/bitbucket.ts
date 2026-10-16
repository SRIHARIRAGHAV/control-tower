import type { BitbucketRepositorySummary, SourceResult } from '../../domain/contracts';

interface BitbucketRepoResponse {
  values?: Array<{
    name: string;
    full_name: string;
    links?: { html?: { href?: string } };
    updated_on?: string;
  }>;
}

export async function fetchBitbucketRepositories(): Promise<SourceResult<BitbucketRepositorySummary>> {
  const workspace = process.env.BITBUCKET_WORKSPACE?.trim();
  const email = process.env.BITBUCKET_ACCOUNT_EMAIL?.trim();
  const token = process.env.BITBUCKET_API_TOKEN;
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

  const authorization = Buffer.from(`${email}:${token}`).toString('base64');
  const response = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(workspace)}?pagelen=50&sort=-updated_on`,
    { headers: { Accept: 'application/json', Authorization: `Basic ${authorization}` } },
  );
  if (!response.ok) {
    throw new Error(`Bitbucket returned HTTP ${response.status}. Check workspace access and the token's repository-read scope.`);
  }

  const body = (await response.json()) as BitbucketRepoResponse;
  const data = (body.values ?? []).map((repository) => ({
    name: repository.name,
    fullName: repository.full_name,
    url: repository.links?.html?.href ?? '',
    updated: repository.updated_on ?? '',
  }));
  return {
    data,
    status: { state: 'connected', count: data.length, message: `Fetched ${data.length} Bitbucket repositories.` },
  };
}
