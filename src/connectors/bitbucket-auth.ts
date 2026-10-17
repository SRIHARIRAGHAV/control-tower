import { requestJson } from './http';

interface BitbucketOAuthTokenResponse {
  access_token: string;
}

export async function fetchBitbucketAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const token = await requestJson<BitbucketOAuthTokenResponse>(
    new URL('https://bitbucket.org/site/oauth2/access_token'),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    },
    {
      expectedHost: 'bitbucket.org',
      errorMessage: 'Bitbucket OAuth token request failed.',
      redact: [clientId, clientSecret, credentials],
    },
  );
  if (!token.access_token) {
    throw new Error('Bitbucket OAuth token response did not include an access token.');
  }
  return token.access_token;
}
