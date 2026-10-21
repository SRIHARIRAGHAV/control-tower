import { randomUUID } from 'node:crypto';
import { kvs } from '@forge/kvs';

export interface AuditRecord {
  actorAccountId: string;
  action: 'createJiraIssue' | 'addJiraComment';
  target: string;
  timestamp: string;
  outcome: 'success' | 'failure';
}

const auditEntity = kvs.entity<{ payload: AuditRecord; updatedAt: string }>('xone_audit_log');

export async function recordWriteAttempt(record: AuditRecord): Promise<void> {
  const key = `${record.timestamp}:${randomUUID()}`;
  await auditEntity.set(key, { payload: record, updatedAt: record.timestamp });
}
