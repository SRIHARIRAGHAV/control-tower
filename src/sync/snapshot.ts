import { readSnapshot, readSyncState, writeSyncResult } from '../db/client';
import { synchronizeSources } from './worker';

export async function syncAndStore() {
  const [previous, previousState] = await Promise.all([readSnapshot(), readSyncState()]);
  const result = await synchronizeSources(previous, previousState);
  await writeSyncResult(result.snapshot, result.state);
  return result;
}
