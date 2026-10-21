export function jiraWriteErrorCode(status: number): 'JIRA_PERMISSION_DENIED' | 'JIRA_WRITE_FAILED' {
  return status === 401 || status === 403 ? 'JIRA_PERMISSION_DENIED' : 'JIRA_WRITE_FAILED';
}
