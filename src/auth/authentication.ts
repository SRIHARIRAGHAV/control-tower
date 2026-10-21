export type AccessRole = 'user';
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

function actionIsAvailable(action: AccessAction): boolean {
  switch (action) {
    case 'VIEW':
    case 'SYNC':
    case 'WRITE':
      return true;
    case 'ADMIN':
      return false;
  }
}

export function authorize(context: unknown, action: AccessAction): AuthorizedUser {
  const user = getAuthenticatedUser(context);
  if (!actionIsAvailable(action)) throw new AccessError('AUTHORIZATION_DENIED');
  return { ...user, role: 'user' };
}

export function accessStatus(context: unknown): AccessStatus {
  if (!accountIdFromContext(context)) {
    return {
      authenticated: false,
      authorized: false,
      role: null,
      canSync: false,
      canWrite: false,
      code: 'AUTHENTICATION_REQUIRED',
    };
  }
  return {
    authenticated: true,
    authorized: true,
    role: 'user',
    canSync: true,
    canWrite: true,
  };
}
