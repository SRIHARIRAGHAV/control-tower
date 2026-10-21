type Role = 'executive' | 'operator';
type ResolverContext = { accountId?: string | null };

type Environment = { process?: { env?: Record<string, string | undefined> } };

function configuredIds(name: string): Set<string> {
  const env = (globalThis as typeof globalThis & Environment).process?.env;
  return new Set((env?.[name] ?? '').split(',').map((value) => value.trim()).filter(Boolean));
}

export function requireRole(context: ResolverContext | undefined, role: Role): void {
  const accountId = context?.accountId?.trim();
  if (!accountId) throw new Error('Access denied: authenticated Atlassian account context is required.');

  const executives = configuredIds('CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS');
  const operators = configuredIds('CONTROL_TOWER_OPERATOR_ACCOUNT_IDS');
  const allowed = role === 'executive'
    ? executives.has(accountId) || operators.has(accountId)
    : operators.has(accountId);

  if (!allowed) throw new Error(`Access denied: the ${role} role is required for this operation.`);
}
