import { z } from 'zod';
import type { AddJiraCommentInput, CreateJiraIssueInput } from '../shared/types';

const createIssueSchema = z.object({
  projectKey: z.string().trim().min(1).max(20).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  summary: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).default(''),
}).strict();

const commentSchema = z.object({
  issueKey: z.string().trim().min(1).max(32).regex(/^[A-Za-z][A-Za-z0-9_-]*-\d+$/),
  body: z.string().trim().min(1).max(10000),
}).strict();

export function parseCreateIssue(payload: unknown): CreateJiraIssueInput {
  const result = createIssueSchema.safeParse(payload);
  if (!result.success) throw new Error('INVALID_REQUEST');
  return result.data;
}

export function parseJiraComment(payload: unknown): AddJiraCommentInput {
  const result = commentSchema.safeParse(payload);
  if (!result.success) throw new Error('INVALID_REQUEST');
  return result.data;
}
