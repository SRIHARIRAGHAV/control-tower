import { kvs } from '@forge/kvs';
import type { RiskForecast } from '../forecast/risk-forecast';
import type { SyncState, XoneSnapshot } from '../shared/types';
import { scopedStorageKey } from './storage-keys';

const snapshotEntity = kvs.entity<{ payload: XoneSnapshot; updatedAt: string }>('xone_snapshot');
const statusEntity = kvs.entity<{ payload: SyncState; updatedAt: string }>('xone_sync_status');
const forecastEntity = kvs.entity<{ payload: RiskForecast; updatedAt: string }>('xone_risk_forecast');

export async function readSnapshot(accountId?: string): Promise<XoneSnapshot | null> {
  const result = await snapshotEntity.get(scopedStorageKey('latest', accountId));
  return result?.payload ?? null;
}

export async function readSyncState(accountId?: string): Promise<SyncState | null> {
  const result = await statusEntity.get(scopedStorageKey('latest', accountId));
  return result?.payload ?? null;
}

export async function readRiskForecast(accountId?: string): Promise<RiskForecast | null> {
  const result = await forecastEntity.get(scopedStorageKey('latest', accountId));
  return result?.payload ?? null;
}

export async function writeSyncResult(
  snapshot: XoneSnapshot,
  state: SyncState,
  forecast?: RiskForecast,
  accountId?: string,
): Promise<void> {
  const latestKey = scopedStorageKey('latest', accountId);
  const writes = [
    snapshotEntity.set(latestKey, { payload: snapshot, updatedAt: snapshot.syncedAt }),
    statusEntity.set(latestKey, { payload: state, updatedAt: state.syncedAt ?? snapshot.syncedAt }),
  ];
  if (forecast) {
    writes.push(forecastEntity.set(latestKey, { payload: forecast, updatedAt: forecast.generatedAt }));
  }
  await Promise.all(writes);
}
