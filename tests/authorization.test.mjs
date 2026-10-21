import assert from 'node:assert/strict';
import test from 'node:test';
import { requireRole } from '../src/resolvers/authorization.ts';

test('rejects missing account context and unconfigured roles by default', () => {
  delete process.env.CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS;
  delete process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS;
  assert.throws(() => requireRole(undefined, 'executive'), /Access denied/);
  assert.throws(() => requireRole({ accountId: 'demo-account' }, 'operator'), /Access denied/);
});

test('allows configured executives to view but not perform operator actions', () => {
  process.env.CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS = 'exec-1, exec-2';
  process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS = 'ops-1';
  assert.doesNotThrow(() => requireRole({ accountId: 'exec-1' }, 'executive'));
  assert.throws(() => requireRole({ accountId: 'exec-1' }, 'operator'), /Access denied/);
  assert.doesNotThrow(() => requireRole({ accountId: 'ops-1' }, 'executive'));
  assert.doesNotThrow(() => requireRole({ accountId: 'ops-1' }, 'operator'));
  delete process.env.CONTROL_TOWER_EXECUTIVE_ACCOUNT_IDS;
  delete process.env.CONTROL_TOWER_OPERATOR_ACCOUNT_IDS;
});
