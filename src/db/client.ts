import { kvs } from '@forge/kvs';
import type { RiskForecast } from '../forecast/risk-forecast';
import type { SyncState, XoneSnapshot } from '../shared/types';

const snapshotEntity = kvs.entity<{ payload: XoneSnapshot; updatedAt: string }>('xone_snapshot');
const statusEntity = kvs.entity<{ payload: SyncState; updatedAt: string }>('xone_sync_status');
const forecastEntity = kvs.entity<{ payload: RiskForecast; updatedAt: string }>('xone_risk_forecast');

export async function readSnapshot(): Promise<XoneSnapshot | null> {
  const result = await snapshotEntity.get('latest');
  return result?.payload ?? null;
}

export async function readSyncState(): Promise<SyncState | null> {
  const result = await statusEntity.get('latest');
  return result?.payload ?? null;
}

export async function readRiskForecast(): Promise<RiskForecast | null> {
  const result = await forecastEntity.get('latest');
  return result?.payload ?? null;
}

export async function writeSyncResult(snapshot: XoneSnapshot, state: SyncState, forecast: RiskForecast): Promise<void> {
  await Promise.all([
    snapshotEntity.set('latest', { payload: snapshot, updatedAt: snapshot.syncedAt }),
    statusEntity.set('latest', { payload: state, updatedAt: snapshot.syncedAt }),
    forecastEntity.set('latest', { payload: forecast, updatedAt: forecast.generatedAt }),
  ]);
}
