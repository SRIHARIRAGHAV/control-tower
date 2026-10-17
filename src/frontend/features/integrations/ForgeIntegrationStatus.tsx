import { useEffect, useMemo, useState } from 'react';
import type { SourceStatus, SyncState, XoneSnapshot } from '../../../shared/types';
import { getDashboardData, syncNow } from '../../services/forge-api';

type IntegrationKey = 'jira' | 'confluence' | 'bitbucket';

const sourceLabels: Array<[IntegrationKey, string]> = [
  ['jira', 'Jira'],
  ['confluence', 'Confluence'],
  ['bitbucket', 'Bitbucket'],
];

function sourceText(status: SourceStatus): string {
  if (status.state === 'connected') return `Connected · ${status.count} items`;
  const lastSuccess = status.syncedAt ? ` Last successful sync: ${new Date(status.syncedAt).toLocaleString()}.` : '';
  return `${status.message}${lastSuccess}`;
}

export default function ForgeIntegrationStatus() {
  const [state, setState] = useState<SyncState | null>(null);
  const [snapshot, setSnapshot] = useState<XoneSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');

  async function loadStatus() {
    setIsLoading(true);
    try {
      const data = await getDashboardData();
      setState(data.state);
      setSnapshot(data.snapshot);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Forge status could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }

  async function syncSources() {
    setIsSyncing(true);
    try {
      const data = await syncNow();
      setState(data.state);
      setSnapshot(data.snapshot);
      setError('');
    } catch (reason) {
      const syncError = reason instanceof Error ? reason.message : 'Source synchronization failed.';
      try {
        const data = await getDashboardData();
        setState(data.state);
        setSnapshot(data.snapshot);
      } catch (statusReason) {
        const statusError = statusReason instanceof Error ? statusReason.message : 'Status refresh failed.';
        setError(statusError === syncError ? syncError : `${syncError} Status refresh failed: ${statusError}`);
        return;
      }
      setError(syncError);
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  const connectedCount = useMemo(
    () => sourceLabels.filter(([key]) => state?.[key]?.state === 'connected').length,
    [state],
  );

  return (
    <div className="forge-status">
      <button
        className="forge-status-toggle"
        type="button"
        aria-label="Atlassian integration status"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className={`forge-status-dot${connectedCount ? ' connected' : ''}`} />
        {isLoading ? 'Sources · checking' : `Sources · ${connectedCount}/3`}
      </button>
      {isOpen && (
        <div className="forge-status-pop">
        <b>Connected data sources</b>
        {sourceLabels.map(([key, label]) => (
          <div className="forge-source" key={key}>
            <span>{label}</span>
            <small>{state ? sourceText(state[key]) : isLoading ? 'Checking…' : 'Not available'}</small>
          </div>
        ))}
        {snapshot && (
          <div className="forge-items">
            <b>Synced records</b>
            <section className="forge-items-group" aria-label={`Jira issues, ${snapshot.jiraIssues.length} records`}>
              <b>Jira issues · {snapshot.jiraIssues.length}</b>
              {snapshot.jiraIssues.map((issue) => (
                <p key={issue.key}>
                  <strong>{issue.key}</strong> · {issue.summary}
                  <small>{issue.project} · {issue.status} · {issue.priority}</small>
                </p>
              ))}
            </section>
            <section className="forge-items-group" aria-label={`Confluence pages, ${snapshot.confluencePages.length} records`}>
              <b>Confluence pages · {snapshot.confluencePages.length}</b>
              {snapshot.confluencePages.map((page) => (
                <p key={page.id}><strong>{page.title}</strong><small>{page.space}</small></p>
              ))}
            </section>
            <section className="forge-items-group" aria-label={`Bitbucket repositories, ${snapshot.bitbucketRepositories.length} records`}>
              <b>Bitbucket repositories · {snapshot.bitbucketRepositories.length}</b>
              {snapshot.bitbucketRepositories.map((repository) => (
                <p key={repository.fullName}>
                  {repository.url
                    ? <a href={repository.url} target="_blank" rel="noreferrer">{repository.fullName}</a>
                    : <strong>{repository.fullName}</strong>}
                  <small>{repository.updated}</small>
                </p>
              ))}
            </section>
            {!snapshot.jiraIssues.length && !snapshot.confluencePages.length && !snapshot.bitbucketRepositories.length && (
              <p className="forge-empty">No records are available in the latest snapshot.</p>
            )}
          </div>
        )}
        {error && <p className="forge-status-error">{error}</p>}
        <button className="btn2" type="button" onClick={syncSources} disabled={isSyncing || isLoading}>
          {isSyncing ? 'Syncing…' : 'Sync sources now'}
        </button>
        </div>
      )}
    </div>
  );
}
