export const MAX_SOURCE_AGE_MS = 2 * 60 * 60 * 1000;

export function isSourceFresh(syncedAt: string | undefined, now = Date.now()): boolean {
  if (!syncedAt) return false;
  const timestamp = new Date(syncedAt).getTime();
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= MAX_SOURCE_AGE_MS;
}
