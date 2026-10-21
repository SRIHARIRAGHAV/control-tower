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
import { shouldRunInitialSync } from '../src/shared/initial-sync.ts';

test('missing Forge account context is rejected as unauthenticated', () => {
  assert.throws(
    () => getAuthenticatedUser(undefined),
    (error) => error instanceof AccessError && error.code === 'AUTHENTICATION_REQUIRED',
  );
});

test('any authenticated Jira user can view, sync, and attempt writes', () => {
  process.env.CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS = 'another-user';
  process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS = 'another-user';
  process.env.CONTROL_TOWER_ADMIN_ACCOUNT_IDS = 'another-user';
  for (const action of ['VIEW', 'SYNC', 'WRITE']) {
    assert.equal(authorize({ accountId: 'jira-user' }, action).role, 'user');
  }
  assert.throws(() => authorize({ accountId: 'jira-user' }, 'ADMIN'), /AUTHORIZATION_DENIED/);
  delete process.env.CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS;
  delete process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS;
  delete process.env.CONTROL_TOWER_ADMIN_ACCOUNT_IDS;
});

test('frontend payload identity cannot substitute for Forge context identity', () => {
  assert.throws(
    () => authorize({ payload: { accountId: 'jira-user' } }, 'WRITE'),
    /AUTHENTICATION_REQUIRED/,
  );
});

test('auth status authorizes any signed-in user without disclosing account IDs', () => {
  const status = accessStatus({ accountId: 'jira-user' });
  assert.deepEqual(status, {
    authenticated: true,
    authorized: true,
    role: 'user',
    canSync: true,
    canWrite: true,
  });
  assert.equal('accountId' in status, false);
  assert.equal(JSON.stringify(status).includes('jira-user'), false);
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

test('initial page load retries when no source has ever synced successfully', () => {
  const emptySnapshot = {
    jiraIssues: [],
    confluencePages: [],
    bitbucketRepositories: [],
    syncedAt: '',
  };
  const failedState = {
    jira: { state: 'error', count: 0, message: 'Jira unavailable' },
    confluence: { state: 'error', count: 0, message: 'Confluence unavailable' },
    bitbucket: { state: 'not-configured', count: 0, message: 'Bitbucket credentials missing' },
  };
  assert.equal(shouldRunInitialSync(null, null), true);
  assert.equal(shouldRunInitialSync(emptySnapshot, failedState), true);
  assert.equal(shouldRunInitialSync(emptySnapshot, {
    ...failedState,
    jira: { state: 'connected', count: 0, message: 'No visible Jira issues' },
  }), false);
});
