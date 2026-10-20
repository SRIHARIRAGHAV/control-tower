export function buildJiraSearchJql(projectKey?: string): string {
  const normalizedKey = projectKey?.trim();
  if (normalizedKey && !/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(normalizedKey)) {
    throw new Error('JIRA_PROJECT_KEY must be a valid Jira project key, such as KAN.');
  }

  return normalizedKey
    ? `project = ${normalizedKey} ORDER BY updated DESC`
    : 'project in projectsWhereUserHasPermission("BROWSE_PROJECTS") ORDER BY updated DESC';
}
