import { kvs } from '@forge/kvs';
import type { RiskForecast } from '../forecast/risk-forecast';
import type { SyncState, XoneSnapshot } from '../shared/types';
import { scopedStorageKey } from './storage-keys';

const SNAPSHOT_KEY = 'xone_snapshot:latest';
const STATUS_KEY = 'xone_sync_status:latest';
const FORECAST_KEY = 'xone_risk_forecast:latest';

export async function readSnapshot(accountId?: string): Promise<XoneSnapshot | null> {
  return (await kvs.get<XoneSnapshot>(scopedStorageKey(SNAPSHOT_KEY, accountId))) ?? null;
}

export async function readSyncState(accountId?: string): Promise<SyncState | null> {
  return (await kvs.get<SyncState>(scopedStorageKey(STATUS_KEY, accountId))) ?? null;
}

export async function readRiskForecast(accountId?: string): Promise<RiskForecast | null> {
  return (await kvs.get<RiskForecast>(scopedStorageKey(FORECAST_KEY, accountId))) ?? null;
}

export async function writeSyncResult(
  snapshot: XoneSnapshot,
  state: SyncState,
  forecast?: RiskForecast,
  accountId?: string,
): Promise<void> {
  const writes = [
    kvs.set(scopedStorageKey(SNAPSHOT_KEY, accountId), snapshot),
    kvs.set(scopedStorageKey(STATUS_KEY, accountId), state),
  ];
  if (forecast) {
    writes.push(kvs.set(scopedStorageKey(FORECAST_KEY, accountId), forecast));
  }
  await Promise.all(writes);
}
