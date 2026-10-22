import { randomUUID } from 'node:crypto';
import { kvs } from '@forge/kvs';

export interface AuditRecord {
  actorAccountId: string;
  action: 'createJiraIssue' | 'addJiraComment';
  target: string;
  timestamp: string;
  outcome: 'success' | 'failure';
}

export async function recordWriteAttempt(record: AuditRecord): Promise<void> {
  await kvs.set(`xone_audit_log:${record.timestamp}:${randomUUID()}`, record);
}
