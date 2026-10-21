export type AccessRole = 'developer' | 'ceo' | 'coo';
export type AccessAction = 'VIEW' | 'SYNC' | 'WRITE' | 'ADMIN';

export interface AuthenticatedUser {
  accountId: string;
}

export interface AuthorizedUser extends AuthenticatedUser {
  role: AccessRole;
}

export interface AccessStatus {
  authenticated: boolean;
  authorized: boolean;
  role: AccessRole | null;
  canSync: boolean;
  canWrite: boolean;
  code?: 'AUTHENTICATION_REQUIRED' | 'AUTHORIZATION_DENIED' | 'AUTH_STATUS_UNAVAILABLE';
}

export class AccessError extends Error {
  readonly code: 'AUTHENTICATION_REQUIRED' | 'AUTHORIZATION_DENIED';

  constructor(code: 'AUTHENTICATION_REQUIRED' | 'AUTHORIZATION_DENIED') {
    super(code);
    this.name = 'AccessError';
    this.code = code;
  }
}

type Environment = { process?: { env?: Record<string, string | undefined> } };

function environmentValue(name: string): string {
  const env = (globalThis as typeof globalThis & Environment).process?.env;
  return env?.[name]?.trim().toLowerCase() ?? '';
}

function configuredIds(name: string): Set<string> {
  const env = (globalThis as typeof globalThis & Environment).process?.env;
  return new Set((env?.[name] ?? '').split(',').map((value) => value.trim()).filter(Boolean));
}

function accountIdFromContext(context: unknown): string | undefined {
  if (!context || typeof context !== 'object' || !('accountId' in context)) return undefined;
  const accountId = context.accountId;
  return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : undefined;
}

export function getAuthenticatedUser(context: unknown): AuthenticatedUser {
  const accountId = accountIdFromContext(context);
  if (!accountId) throw new AccessError('AUTHENTICATION_REQUIRED');
  return { accountId };
}

function roleFor(accountId: string): AccessRole | null {
  const mode = environmentValue('CONTROL_TOWER_ACCESS_MODE');
  if (mode === 'development' && configuredIds('CONTROL_TOWER_DEVELOPER_ACCOUNT_IDS').has(accountId)) {
    return 'developer';
  }
  if (mode === 'production') {
    if (configuredIds('CONTROL_TOWER_CEO_ACCOUNT_IDS').has(accountId)) return 'ceo';
    if (configuredIds('CONTROL_TOWER_COO_ACCOUNT_IDS').has(accountId)) return 'coo';
  }
  return null;
}

function roleAllowsAction(role: AccessRole, action: AccessAction): boolean {
  switch (action) {
    case 'VIEW':
    case 'SYNC':
    case 'WRITE':
      return role === 'developer' || role === 'ceo' || role === 'coo';
    case 'ADMIN':
      return false;
  }
}

export function authorize(context: unknown, action: AccessAction): AuthorizedUser {
  const user = getAuthenticatedUser(context);
  const role = roleFor(user.accountId);
  if (!role || !roleAllowsAction(role, action)) throw new AccessError('AUTHORIZATION_DENIED');
  return { ...user, role };
}

export function accessStatus(context: unknown): AccessStatus {
  const accountId = accountIdFromContext(context);
  if (!accountId) {
    return {
      authenticated: false,
      authorized: false,
      role: null,
      canSync: false,
      canWrite: false,
      code: 'AUTHENTICATION_REQUIRED',
    };
  }
  const role = roleFor(accountId);
  if (!role) {
    return {
      authenticated: true,
      authorized: false,
      role: null,
      canSync: false,
      canWrite: false,
      code: 'AUTHORIZATION_DENIED',
    };
  }
  return {
    authenticated: true,
    authorized: true,
    role,
    canSync: true,
    canWrite: true,
  };
}
