import { describe, expect, it } from 'vitest';
import { buildJiraSearchJql } from '../src/backend/services/jira-query';

describe('buildJiraSearchJql', () => {
  it('uses the configured Jira project key when provided', () => {
    expect(buildJiraSearchJql('KAN')).toBe('project = KAN ORDER BY updated DESC');
  });

  it('searches all projects the signed-in user can browse when no key is set', () => {
    expect(buildJiraSearchJql()).toBe(
      'project in projectsWhereUserHasPermission("BROWSE_PROJECTS") ORDER BY updated DESC',
    );
  });

  it('rejects invalid project keys instead of building unsafe JQL', () => {
    expect(() => buildJiraSearchJql('KAN OR project is not EMPTY')).toThrow(
      'JIRA_PROJECT_KEY must be a valid Jira project key, such as KAN.',
    );
  });
});
