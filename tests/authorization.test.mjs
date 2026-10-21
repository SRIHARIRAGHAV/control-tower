import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accessStatus,
  AccessError,
  authorize,
  getAuthenticatedUser,
} from '../src/auth/authentication.ts';
import {
  parseCreateIssue,
  parseJiraComment,
} from '../src/auth/write-validation.ts';
import { scopedStorageKey } from '../src/db/storage-keys.ts';
import { jiraWriteErrorCode } from '../src/services/jira-write-error.ts';
import { jiraProjectKeyForContext } from '../src/backend/services/jira-query.ts';

function configureAccess(mode, { developers = '', ceos = '', coos = '' } = {}) {
  process.env.CONTROL_TOWER_ACCESS_MODE = mode;
  process.env.CONTROL_TOWER_DEVELOPER_ACCOUNT_IDS = developers;
  process.env.CONTROL_TOWER_CEO_ACCOUNT_IDS = ceos;
  process.env.CONTROL_TOWER_COO_ACCOUNT_IDS = coos;
}

test('missing Forge account context is rejected as unauthenticated', () => {
  assert.throws(
    () => getAuthenticatedUser(undefined),
    (error) => error instanceof AccessError && error.code === 'AUTHENTICATION_REQUIRED',
  );
});

test('access is denied by default when access mode or role allowlists are missing', () => {
  configureAccess('', {});
  assert.throws(() => authorize({ accountId: 'jira-user' }, 'VIEW'), /AUTHORIZATION_DENIED/);
  configureAccess('production', {});
  assert.throws(() => authorize({ accountId: 'jira-user' }, 'VIEW'), /AUTHORIZATION_DENIED/);
});

test('developers are allowed only in development mode', () => {
  configureAccess('development', { developers: 'dev-1, dev-2', ceos: 'exec-1', coos: 'exec-2' });
  assert.equal(authorize({ accountId: 'dev-1' }, 'VIEW').role, 'developer');
  assert.equal(authorize({ accountId: 'dev-2' }, 'SYNC').role, 'developer');
  assert.throws(() => authorize({ accountId: 'exec-1' }, 'VIEW'), /AUTHORIZATION_DENIED/);
  assert.throws(() => authorize({ accountId: 'dev-1' }, 'ADMIN'), /AUTHORIZATION_DENIED/);
});

test('only configured CEO and COO accounts are allowed in production', () => {
  configureAccess('production', {
    developers: 'dev-1',
    ceos: 'ceo-1',
    coos: 'coo-1',
  });
  assert.equal(authorize({ accountId: 'ceo-1' }, 'VIEW').role, 'ceo');
  assert.equal(authorize({ accountId: 'ceo-1' }, 'WRITE').role, 'ceo');
  assert.equal(authorize({ accountId: 'coo-1' }, 'SYNC').role, 'coo');
  assert.equal(authorize({ accountId: 'coo-1' }, 'WRITE').role, 'coo');
  assert.throws(() => authorize({ accountId: 'dev-1' }, 'VIEW'), /AUTHORIZATION_DENIED/);
  assert.throws(() => authorize({ accountId: 'jira-admin' }, 'VIEW'), /AUTHORIZATION_DENIED/);
  assert.throws(() => authorize({ accountId: 'ordinary-user' }, 'VIEW'), /AUTHORIZATION_DENIED/);
  assert.throws(() => authorize({ accountId: 'ceo-1' }, 'ADMIN'), /AUTHORIZATION_DENIED/);
});

test('frontend identity and role payloads cannot grant authorization', () => {
  configureAccess('production', { ceos: 'ceo-1' });
  assert.throws(
    () => authorize({ payload: { accountId: 'ceo-1', role: 'ceo' } }, 'WRITE'),
    /AUTHENTICATION_REQUIRED/,
  );
});

test('auth status returns current role without disclosing account IDs', () => {
  configureAccess('production', { ceos: 'ceo-secret' });
  const status = accessStatus({ accountId: 'ceo-secret' });
  assert.deepEqual(status, {
    authenticated: true,
    authorized: true,
    role: 'ceo',
    canSync: true,
    canWrite: true,
  });
  assert.equal('accountId' in status, false);
  assert.equal(JSON.stringify(status).includes('ceo-secret'), false);
});

test('auth status denies authenticated users without the current environment role', () => {
  configureAccess('production', { ceos: 'ceo-1' });
  assert.deepEqual(accessStatus({ accountId: 'jira-admin' }), {
    authenticated: true,
    authorized: false,
    role: null,
    canSync: false,
    canWrite: false,
    code: 'AUTHORIZATION_DENIED',
  });
});

test('access revocation takes effect on the next authorization check', () => {
  configureAccess('production', { coos: 'coo-1' });
  assert.equal(authorize({ accountId: 'coo-1' }, 'VIEW').role, 'coo');
  configureAccess('production', { coos: '' });
  assert.throws(() => authorize({ accountId: 'coo-1' }, 'VIEW'), /AUTHORIZATION_DENIED/);
});

test('strict write validation rejects identity and role fields from browser payloads', () => {
  assert.throws(
    () => parseCreateIssue({ projectKey: 'KAN', summary: 'Task', accountId: 'ops-1' }),
    /INVALID_REQUEST/,
  );
  assert.throws(
    () => parseJiraComment({ issueKey: 'KAN-1', body: 'Comment', role: 'admin' }),
    /INVALID_REQUEST/,
  );
  assert.deepEqual(parseCreateIssue({ projectKey: 'KAN', summary: ' Task ' }), {
    projectKey: 'KAN',
    summary: 'Task',
    description: '',
  });
});

test('user snapshots are isolated by a non-reversible storage key', () => {
  const aliceKey = scopedStorageKey('latest', 'account-alice');
  const bobKey = scopedStorageKey('latest', 'account-bob');
  assert.notEqual(aliceKey, bobKey);
  assert.equal(aliceKey.includes('account-alice'), false);
  assert.equal(scopedStorageKey('latest'), 'latest');
});

test('Jira permission failures use safe codes without exposing provider response details', () => {
  assert.equal(jiraWriteErrorCode(401), 'JIRA_PERMISSION_DENIED');
  assert.equal(jiraWriteErrorCode(403), 'JIRA_PERMISSION_DENIED');
  assert.equal(jiraWriteErrorCode(400), 'JIRA_WRITE_FAILED');
});

test('scheduled app-context sync requires a server-configured project key', () => {
  assert.throws(
    () => jiraProjectKeyForContext(undefined, 'app'),
    /JIRA_PROJECT_KEY must be configured/,
  );
  assert.equal(jiraProjectKeyForContext('KAN', 'app'), 'KAN');
  assert.equal(jiraProjectKeyForContext(undefined, 'user'), undefined);
});
