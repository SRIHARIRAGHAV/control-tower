import { syncSources } from '../backend/handlers/source-handlers';
import { resolver } from './registry';

resolver.define('syncNow', syncSources);

export async function hourlySync() {
  const result = await syncSources();
  if ([result.state.jira, result.state.confluence, result.state.bitbucket].every(
    (source) => source.state === 'error' || source.state === 'not-configured',
  )) {
    throw new Error('Scheduled source sync failed for every configured integration.');
  }
}
