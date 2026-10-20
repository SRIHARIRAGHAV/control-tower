import { z } from 'zod';
import { addJiraComment, createJiraIssue } from '../services/jira-writer';
import { resolver } from './registry';

const createIssueSchema = z.object({
  projectKey: z.string().trim().min(1).max(20).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  summary: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).default(''),
});

const commentSchema = z.object({
  issueKey: z.string().trim().min(1).max(32).regex(/^[A-Za-z][A-Za-z0-9_-]*-\d+$/),
  body: z.string().trim().min(1).max(10000),
});

resolver.define('createJiraIssue', async ({ payload }) => {
  const input = createIssueSchema.parse(payload);
  return createJiraIssue(input);
});

resolver.define('addJiraComment', async ({ payload }) => {
  const input = commentSchema.parse(payload);
  return addJiraComment(input);
});
