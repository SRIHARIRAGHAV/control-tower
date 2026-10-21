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

test('missing Forge account context is rejected as unauthenticated', () => {
  assert.throws(
    () => getAuthenticatedUser(undefined),
    (error) => error instanceof AccessError && error.code === 'AUTHENTICATION_REQUIRED',
  );
});

test('authenticated but unlisted account is denied by default', () => {
  delete process.env.CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS;
  delete process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS;
  delete process.env.CONTROL_TOWER_ADMIN_ACCOUNT_IDS;
  assert.throws(
    () => authorize({ accountId: 'jira-user' }, 'VIEW'),
    (error) => error instanceof AccessError && error.code === 'AUTHORIZATION_DENIED',
  );
});

test('executives may view and sync, but cannot write', () => {
  process.env.CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS = 'exec-1';
  delete process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS;
  delete process.env.CONTROL_TOWER_ADMIN_ACCOUNT_IDS;
  assert.equal(authorize({ accountId: 'exec-1' }, 'VIEW').role, 'executive');
  assert.equal(authorize({ accountId: 'exec-1' }, 'SYNC').role, 'executive');
  assert.throws(() => authorize({ accountId: 'exec-1' }, 'WRITE'), /AUTHORIZATION_DENIED/);
});

test('operators may view, sync, and write while admin actions require admin role', () => {
  delete process.env.CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS;
  process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS = 'ops-1';
  process.env.CONTROL_TOWER_ADMIN_ACCOUNT_IDS = 'admin-1';
  assert.equal(authorize({ accountId: 'ops-1' }, 'WRITE').role, 'operator');
  assert.throws(() => authorize({ accountId: 'ops-1' }, 'ADMIN'), /AUTHORIZATION_DENIED/);
  assert.equal(authorize({ accountId: 'admin-1' }, 'ADMIN').role, 'admin');
});

test('frontend payload identity cannot substitute for Forge context identity', () => {
  process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS = 'ops-1';
  assert.throws(
    () => authorize({ payload: { accountId: 'ops-1' } }, 'WRITE'),
    /AUTHENTICATION_REQUIRED/,
  );
});

test('auth status does not disclose account IDs or role configuration', () => {
  process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS = 'ops-secret';
  const status = accessStatus({ accountId: 'ops-secret' });
  assert.deepEqual(status, {
    authenticated: true,
    authorized: true,
    role: 'operator',
    canSync: true,
    canWrite: true,
  });
  assert.equal('accountId' in status, false);
  assert.equal(JSON.stringify(status).includes('ops-secret'), false);
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
