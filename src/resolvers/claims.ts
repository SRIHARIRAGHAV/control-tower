import { recordWriteAttempt } from '../db/audit-log';
import { addJiraComment, createJiraIssue } from '../services/jira-writer';
import { resolver } from './registry';
import { authorize } from './authorization';
import { parseCreateIssue, parseJiraComment } from '../auth/write-validation';

async function auditedWrite<T>(
  actorAccountId: string,
  action: 'createJiraIssue' | 'addJiraComment',
  target: string,
  execute: () => Promise<T>,
): Promise<T> {
  const timestamp = new Date().toISOString();
  let operation: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    operation = { ok: true, value: await execute() };
  } catch (error) {
    operation = { ok: false, error };
  }

  try {
    await recordWriteAttempt({
      actorAccountId,
      action,
      target,
      timestamp,
      outcome: operation.ok ? 'success' : 'failure',
    });
  } catch {
    if (operation.ok) {
      throw new Error('AUDIT_LOG_FAILED: The Jira operation may have completed. Verify the target before retrying.');
    }
    throw new Error('AUDIT_LOG_FAILED: The operation failed and its audit record could not be saved.');
  }

  if (!operation.ok) {
    const message = operation.error instanceof Error ? operation.error.message : '';
    if (message === 'JIRA_PERMISSION_DENIED' || message === 'JIRA_WRITE_FAILED' || message === 'INVALID_REQUEST') {
      throw new Error(message);
    }
    throw new Error('JIRA_WRITE_FAILED');
  }
  return operation.value;
}

resolver.define('createJiraIssue', async ({ payload, context }) => {
  const user = authorize(context, 'WRITE');
  const input = parseCreateIssue(payload);
  return auditedWrite(user.accountId, 'createJiraIssue', input.projectKey, () => createJiraIssue(input));
});

resolver.define('addJiraComment', async ({ payload, context }) => {
  const user = authorize(context, 'WRITE');
  const input = parseJiraComment(payload);
  return auditedWrite(user.accountId, 'addJiraComment', input.issueKey, () => addJiraComment(input));
});
