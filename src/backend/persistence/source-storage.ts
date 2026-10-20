import { readRiskForecast, readSnapshot, readSyncState } from '../../db/client';

export async function readStoredSourceData() {
  const [snapshot, state, forecast] = await Promise.all([readSnapshot(), readSyncState(), readRiskForecast()]);
  return { snapshot, state, forecast };
}
