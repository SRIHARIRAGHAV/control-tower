import { readRiskForecast, readSnapshot, readSyncState } from '../../db/client';
import { isSourceFresh } from '../../shared/data-freshness';

export async function readStoredSourceData(accountId: string) {
  const [snapshot, state, forecast] = await Promise.all([
    readSnapshot(accountId),
    readSyncState(accountId),
    readRiskForecast(accountId),
  ]);
  const jiraIsCurrent = state?.jira.state === 'connected' || state?.jira.state === 'partial';
  const forecastIsCurrent = Boolean(forecast && isSourceFresh(forecast.generatedAt));
  return { snapshot, state, forecast: jiraIsCurrent && forecastIsCurrent ? forecast : null };
}
