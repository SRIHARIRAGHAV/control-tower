import api, { type RequestInit as ForgeRequestInit, type Response as ForgeResponse } from '@forge/api';

interface JsonRequestOptions {
  expectedHost: string;
  errorMessage: string;
  redact?: string[];
}

const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 8_000;

interface TextResponse {
  text(): Promise<string>;
}

function stringsFrom(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (value && typeof value === 'object') {
    return Object.values(value).filter((item): item is string => typeof item === 'string');
  }
  return [];
}

export async function readProviderErrorDetail(response: TextResponse): Promise<string> {
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
      response = await api.fetch(url.toString(), init);
    } catch {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`${options.errorMessage} The external request failed after ${MAX_ATTEMPTS} attempts.`);
      }
      await delay(retryDelay(attempt));
      continue;
    }
    const current = response;
    if (!current || (current.status !== 429 && current.status < 500)) break;
    if (attempt === MAX_ATTEMPTS) break;
    const retryAfter = parseRetryAfter(current.headers.get('Retry-After'));
    await current.text();
    await delay(retryAfter ?? retryDelay(attempt));
  }
  if (!response) throw new Error(`${options.errorMessage} The external request returned no response.`);
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

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  return Math.min(milliseconds, MAX_RETRY_DELAY_MS);
}

function retryDelay(attempt: number): number {
  const exponential = Math.min(MAX_RETRY_DELAY_MS, 250 * 2 ** (attempt - 1));
  return Math.round(exponential * (0.75 + Math.random() * 0.5));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
