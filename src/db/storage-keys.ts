import { createHash } from 'node:crypto';

export function scopedStorageKey(key: string, accountId?: string): string {
  if (!accountId) return key;
  const digest = createHash('sha256').update(accountId).digest('hex');
  return `${key}:user:${digest}`;
}
