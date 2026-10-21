import { readLatestData } from '../../db/client';

export async function readStoredSourceData() {
  const { snapshot, state, forecast } = await readLatestData();
  const jiraIsCurrent = state?.jira.state === 'connected' || state?.jira.state === 'partial';
  return { snapshot, state, forecast: jiraIsCurrent ? forecast : null };
}
