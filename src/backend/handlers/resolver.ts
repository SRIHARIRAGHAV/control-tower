import Resolver from '@forge/resolver';
import { z } from 'zod';
import { readSnapshot, readSyncState, writeSyncResult } from '../../db/snapshot-store';
import { addJiraComment, createJiraIssue } from '../integrations/jira';
import { synchronizeSources } from '../services/source-sync';

const resolver = new Resolver();

const createIssueSchema = z.object({
  projectKey: z.string().trim().min(1).max(20).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  summary: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).default(''),
});

const commentSchema = z.object({
  issueKey: z.string().trim().min(1).max(32).regex(/^[A-Za-z][A-Za-z0-9_-]*-\d+$/),
  body: z.string().trim().min(1).max(10000),
});

async function syncAndStore() {
  const [previous, previousState] = await Promise.all([readSnapshot(), readSyncState()]);
  const result = await synchronizeSources(previous, previousState);
  await writeSyncResult(result.snapshot, result.state);
  return result;
}

resolver.define('getDashboardData', async () => {
  const [snapshot, storedState] = await Promise.all([readSnapshot(), readSyncState()]);
  const configured = Boolean(
    process.env.BITBUCKET_WORKSPACE?.trim() &&
      process.env.BITBUCKET_ACCOUNT_EMAIL?.trim() &&
      process.env.BITBUCKET_API_TOKEN,
  );
  const state =
    storedState ??
    ({
      jira: { state: 'not-synced', count: 0, message: 'Run a sync to check Jira access.' },
      confluence: { state: 'not-synced', count: 0, message: 'Run a sync to check Confluence access.' },
      bitbucket: {
        state: configured ? 'not-synced' : 'not-configured',
        count: 0,
        message: configured ? 'Run a sync to check Bitbucket access.' : 'Bitbucket credentials are not configured.',
      },
    } as const);
  return { snapshot, state };
});

resolver.define('syncNow', async () => {
  const result = await syncAndStore();
  if ([result.state.jira, result.state.confluence, result.state.bitbucket].every(
    (source) => source.state === 'error' || source.state === 'not-configured',
  )) {
    throw new Error('No integration sync succeeded. Review the source statuses and Forge logs.');
  }
  return result;
});

resolver.define('createJiraIssue', async ({ payload }) => {
  const input = createIssueSchema.parse(payload);
  return createJiraIssue(input);
});

resolver.define('addJiraComment', async ({ payload }) => {
  const input = commentSchema.parse(payload);
  return addJiraComment(input);
});

export const handler = resolver.getDefinitions();

export async function hourlySync() {
  const result = await syncAndStore();
  if ([result.state.jira, result.state.confluence, result.state.bitbucket].every(
    (source) => source.state === 'error' || source.state === 'not-configured',
  )) {
    throw new Error('Scheduled source sync failed for every configured integration.');
  }
}
