import assert from 'node:assert/strict';
import test from 'node:test';
import { isSourceFresh, MAX_SOURCE_AGE_MS } from '../src/shared/data-freshness.ts';

test('accepts a recent successful sync but rejects stale, future, and invalid timestamps', () => {
  const now = Date.parse('2026-10-21T12:00:00.000Z');

  assert.equal(isSourceFresh('2026-10-21T11:00:00.000Z', now), true);
  assert.equal(isSourceFresh(new Date(now - MAX_SOURCE_AGE_MS - 1).toISOString(), now), false);
  assert.equal(isSourceFresh(new Date(now + 1).toISOString(), now), false);
  assert.equal(isSourceFresh('not-a-timestamp', now), false);
  assert.equal(isSourceFresh(undefined, now), false);
});
