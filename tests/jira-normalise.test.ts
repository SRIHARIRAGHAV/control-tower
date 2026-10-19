import { describe, expect, it } from 'vitest';
import { mapJiraIssues } from '../src/sync/normalise';

describe('mapJiraIssues', () => {
  it('maps due dates and configured custom fields to dashboard issue data', () => {
    const [issue] = mapJiraIssues({
      issues: [{
        key: 'KAN-1',
        fields: {
          summary: 'Check customer notification delays',
          status: { name: 'To Do' },
          priority: { name: 'High' },
          project: { name: 'Kanban' },
          updated: '2026-10-19T10:00:00.000Z',
          created: '2026-10-01T10:00:00.000Z',
          duedate: '2026-10-30',
          customfield_10001: 'Demo Client',
          customfield_10008: { value: 'Operations' },
          customfield_10009: { value: 'Finance & Legal' },
          customfield_10002: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sample customer impact.' }] }],
          },
          customfield_10003: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review the queue.' }] }],
          },
          customfield_10004: { displayName: 'Demo Owner' },
          customfield_10005: { value: 'Pending' },
          customfield_10006: { displayName: 'COO User' },
          customfield_10007: '2026-10-29',
        },
      }],
    }, {
      department: 'customfield_10008',
      impactedDepartment: 'customfield_10009',
      client: 'customfield_10001',
      customerImpact: 'customfield_10002',
      mitigation: 'customfield_10003',
      owner: 'customfield_10004',
      cooDecision: 'customfield_10005',
      cooApprover: 'customfield_10006',
      approvalDate: 'customfield_10007',
    });

    expect(issue).toMatchObject({
      key: 'KAN-1',
      createdAt: '2026-10-01T10:00:00.000Z',
      dueDate: '2026-10-30',
      department: 'Operations',
      impactedDepartment: 'Finance & Legal',
      client: 'Demo Client',
      customerImpact: 'Sample customer impact.',
      mitigation: 'Review the queue.',
      owner: 'Demo Owner',
      cooDecision: 'Pending',
      cooApprover: 'COO User',
      approvalDate: '2026-10-29',
    });
  });

  it('keeps Jira custom fields optional when no values are available', () => {
    const [issue] = mapJiraIssues({
      issues: [{ key: 'KAN-2', fields: { summary: 'No custom values' } }],
    });

    expect(issue.dueDate).toBeUndefined();
    expect(issue.cooDecision).toBeUndefined();
  });
});
