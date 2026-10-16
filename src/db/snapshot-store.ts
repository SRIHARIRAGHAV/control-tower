import { kvs } from '@forge/kvs';
import type { SyncState, XoneSnapshot } from '../domain/contracts';

const snapshotEntity = kvs.entity<{ payload: XoneSnapshot; updatedAt: string }>('xone_snapshot');
const statusEntity = kvs.entity<{ payload: SyncState; updatedAt: string }>('xone_sync_status');

export async function readSnapshot(): Promise<XoneSnapshot | null> {
  const result = await snapshotEntity.get('latest');
  return result?.payload ?? null;
}

export async function readSyncState(): Promise<SyncState | null> {
  const result = await statusEntity.get('latest');
  return result?.payload ?? null;
}

export async function writeSyncResult(snapshot: XoneSnapshot, state: SyncState): Promise<void> {
  await Promise.all([
    snapshotEntity.set('latest', { payload: snapshot, updatedAt: snapshot.syncedAt }),
    statusEntity.set('latest', { payload: state, updatedAt: snapshot.syncedAt }),
  ]);
}
