import { readSnapshot, readSyncState } from '../../db/client';

export async function readStoredSourceData() {
  const [snapshot, state] = await Promise.all([readSnapshot(), readSyncState()]);
  return { snapshot, state };
}
