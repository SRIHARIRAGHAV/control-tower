interface JsonRequestOptions {
  expectedHost: string;
  errorMessage: string;
  redact?: string[];
}

export async function requestJson<T>(
  url: URL,
  init: RequestInit,
  options: JsonRequestOptions,
): Promise<T> {
  if (url.protocol !== 'https:' || url.hostname !== options.expectedHost) {
    throw new Error('The external service returned an unexpected URL; stopping the request.');
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    let details = (await response.text()).replace(/\s+/g, ' ').trim();
    for (const secret of options.redact ?? []) {
      if (secret) details = details.replaceAll(secret, '[redacted]');
    }
    details = details.slice(0, 300);
    throw new Error(
      `${options.errorMessage} HTTP ${response.status}${details ? `: ${details}` : ''}.`,
    );
  }

  return (await response.json()) as T;
}
