import { readRiskForecast, readSnapshot, readSyncState } from '../../db/client';

export async function readStoredSourceData() {
  const [snapshot, state, forecast] = await Promise.all([readSnapshot(), readSyncState(), readRiskForecast()]);
  const jiraIsCurrent = state?.jira.state === 'connected' || state?.jira.state === 'partial';
  return { snapshot, state, forecast: jiraIsCurrent ? forecast : null };
}
