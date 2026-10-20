import { useEffect, useMemo, useState } from 'react';
import type { DashboardDataResponse, SourceStatus, SyncState, XoneSnapshot } from '../../../shared/types';
import SourceInsights from '../../../components/SourceInsights';
import { getDashboardData, syncNow } from '../../services/forge-api';

type IntegrationKey = 'jira' | 'confluence' | 'bitbucket';
type RiskForecast = DashboardDataResponse['forecast'];

const sourceLabels: Array<[IntegrationKey, string]> = [
  ['jira', 'Jira'],
  ['confluence', 'Confluence'],
  ['bitbucket', 'Bitbucket'],
];

function publishDashboardData(snapshot: XoneSnapshot | null, state: SyncState | null, forecast?: RiskForecast) {
  window.dispatchEvent(new CustomEvent('xone-source-data', { detail: { snapshot, state, forecast } }));
}

function sourceText(status: SourceStatus): string {
  if (status.state === 'connected') return `Connected · ${status.count} items`;
  const lastSuccess = status.syncedAt ? ` Last successful sync: ${new Date(status.syncedAt).toLocaleString()}.` : '';
  return `${status.message}${lastSuccess}`;
}

export default function ForgeIntegrationStatus() {
  const [state, setState] = useState<SyncState | null>(null);
  const [snapshot, setSnapshot] = useState<XoneSnapshot | null>(null);
  const [forecast, setForecast] = useState<RiskForecast>();
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
      setForecast(data.forecast);
      publishDashboardData(data.snapshot, data.state, data.forecast);
      setError('');
    } catch (reason) {
      publishDashboardData(snapshot, state, forecast);
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
      setForecast(data.forecast);
      publishDashboardData(data.snapshot, data.state, data.forecast);
      setError('');
    } catch (reason) {
      const syncError = reason instanceof Error ? reason.message : 'Source synchronization failed.';
      try {
        const data = await getDashboardData();
        setState(data.state);
        setSnapshot(data.snapshot);
        setForecast(data.forecast);
        publishDashboardData(data.snapshot, data.state, data.forecast);
      } catch (statusReason) {
        const statusError = statusReason instanceof Error ? statusReason.message : 'Status refresh failed.';
        publishDashboardData(snapshot, state, forecast);
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
            <SourceInsights snapshot={snapshot} state={state} />
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
            <section className="forge-items-group" aria-label="Recent Bitbucket commits">
              <b>Recent Bitbucket commits</b>
              {snapshot.bitbucketRepositories.flatMap((repository) =>
                (repository.recentCommits ?? []).map((commit) => ({ repository, commit })),
              ).sort((a, b) => new Date(b.commit.date).getTime() - new Date(a.commit.date).getTime())
                .slice(0, 10)
                .map(({ repository, commit }) => (
                  <p key={`${repository.fullName}:${commit.hash}`}>
                    {commit.url
                      ? <a href={commit.url} target="_blank" rel="noreferrer">{commit.message.split('\n')[0]}</a>
                      : <strong>{commit.message.split('\n')[0]}</strong>}
                    <small>{repository.fullName} · {commit.author}{commit.date ? ` · ${new Date(commit.date).toLocaleString()}` : ''}</small>
                  </p>
                ))}
              {!snapshot.bitbucketRepositories.some((repository) => repository.recentCommits?.length) && (
                <p className="forge-empty">No recent commits are available in the latest snapshot.</p>
              )}
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
