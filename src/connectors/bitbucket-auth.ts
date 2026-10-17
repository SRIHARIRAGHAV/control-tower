export function bitbucketAuthorizationHeaders(email: string, token: string): Record<string, string> {
  const credentials = Buffer.from(`${email}:${token}`).toString('base64');
  return { Accept: 'application/json', Authorization: `Basic ${credentials}` };
}
