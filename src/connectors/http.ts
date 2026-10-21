import {
  fetch as forgeFetch,
  type RequestInit as ForgeRequestInit,
  type Response as ForgeResponse,
} from '@forge/api';

interface JsonRequestOptions {
  expectedHost: string;
  errorMessage: string;
  redact?: string[];
}

const MAX_ATTEMPTS = 3;

function retryDelay(response: ForgeResponse, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 5000);
    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp)) return Math.min(Math.max(0, timestamp - Date.now()), 5000);
  }
  return Math.min(250 * 2 ** (attempt - 1), 2000);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stringsFrom(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (value && typeof value === 'object') {
    return Object.values(value).filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export async function readProviderErrorDetail(response: Pick<ForgeResponse, 'text'>): Promise<string> {
  const body = await response.text();
  let detail = body;

  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      const error = parsed as Record<string, unknown>;
      const nestedError =
        error.error && typeof error.error === 'object'
          ? (error.error as Record<string, unknown>)
          : undefined;
      const errorDetail =
        nestedError?.detail && typeof nestedError.detail === 'object'
          ? (nestedError.detail as Record<string, unknown>)
          : undefined;
      const requiredScopes = stringsFrom(errorDetail?.required);
      const messages = [
        ...stringsFrom(error.errorMessages),
        ...stringsFrom(error.errors),
        ...stringsFrom(error.message),
        ...stringsFrom(error.reason),
        ...stringsFrom(nestedError?.message),
        ...(requiredScopes.length ? [`Required scope: ${requiredScopes.join(', ')}`] : []),
      ];
      if (messages.length) detail = messages.join(' ');
    }
  } catch {
    // Keep plain-text provider errors useful when the response is not JSON.
  }

  return detail.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 400);
}

export async function requestJson<T>(
  url: URL,
  init: ForgeRequestInit,
  options: JsonRequestOptions,
): Promise<T> {
  if (url.protocol !== 'https:' || url.hostname !== options.expectedHost) {
    throw new Error('The external service returned an unexpected URL; stopping the request.');
  }

  let response: ForgeResponse | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      response = await forgeFetch(url.toString(), init);
    } catch (error) {
      if (error instanceof TypeError && attempt < MAX_ATTEMPTS) {
        await wait(250 * 2 ** (attempt - 1));
        continue;
      }
      const detail = error instanceof Error ? error.message : 'Unknown network error';
      throw new Error(`${options.errorMessage} Network request to ${url.hostname} failed: ${detail}.`, { cause: error });
    }

    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === MAX_ATTEMPTS) break;
    await wait(retryDelay(response, attempt));
  }
  if (!response) {
    throw new Error(`${options.errorMessage} Network request to ${url.hostname} returned no response.`);
  }

  if (!response.ok) {
    let details = await readProviderErrorDetail(response);
    for (const secret of options.redact ?? []) {
      if (secret) details = details.replaceAll(secret, '[redacted]');
    }
    details = details.slice(0, 400);
    throw new Error(
      `${options.errorMessage} HTTP ${response.status}${details ? `: ${details}` : ''}.`,
    );
  }

  return (await response.json()) as T;
}
