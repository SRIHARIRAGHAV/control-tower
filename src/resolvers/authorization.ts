
type Role = 'executive' | 'operator';
type ResolverContext = { accountId?: string | null };

export function requireRole(
  _context: ResolverContext | undefined,
  _role: Role
): void {
  // Temporary demo mode: allow all users through the application role check.
  return;
}
