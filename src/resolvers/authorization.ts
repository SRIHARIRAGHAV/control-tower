export interface ResolverContext {
  accountId?: unknown;
}

export type ResolverAction = 'view' | 'sync' | 'write';

export function authorize(context: ResolverContext, action: ResolverAction): string {
  const accountId = typeof context.accountId === 'string' ? context.accountId.trim() : '';
  if (!accountId) throw new Error('Authentication is required to access this resolver.');

  const allowlist = (process.env.CONTROL_TOWER_ALLOWED_ACCOUNT_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowlist.length && !allowlist.includes(accountId)) {
    throw new Error(`Access denied for resolver action: ${action}.`);
  }
  return accountId;
}
