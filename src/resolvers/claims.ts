import { z } from 'zod';
import { recordWriteAttempt } from '../db/audit-log';
import { addJiraComment, createJiraIssue } from '../services/jira-writer';
import { resolver } from './registry';
import { authorize } from './authorization';

const createIssueSchema = z.object({
  projectKey: z.string().trim().min(1).max(20).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  summary: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).default(''),
});

const commentSchema = z.object({
  issueKey: z.string().trim().min(1).max(32).regex(/^[A-Za-z][A-Za-z0-9_-]*-\d+$/),
  body: z.string().trim().min(1).max(10000),
});

resolver.define('createJiraIssue', async ({ payload, context }) => {
  const actorAccountId = authorize(context, 'write');
  const input = createIssueSchema.parse(payload);
  const timestamp = new Date().toISOString();
  let outcome: 'success' | 'failure' = 'failure';
  try {
    const result = await createJiraIssue(input);
    outcome = 'success';
    return result;
  } finally {
    await recordWriteAttempt({
      actorAccountId,
      action: 'createJiraIssue',
      target: input.projectKey,
      timestamp,
      outcome,
    });
  }
});

resolver.define('addJiraComment', async ({ payload, context }) => {
  const actorAccountId = authorize(context, 'write');
  const input = commentSchema.parse(payload);
  const timestamp = new Date().toISOString();
  let outcome: 'success' | 'failure' = 'failure';
  try {
    const result = await addJiraComment(input);
    outcome = 'success';
    return result;
  } finally {
    await recordWriteAttempt({
      actorAccountId,
      action: 'addJiraComment',
      target: input.issueKey,
      timestamp,
      outcome,
    });
  }
});
