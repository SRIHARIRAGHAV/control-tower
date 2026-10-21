import { useEffect, useState } from 'react';
import type { DashboardDataResponse } from './shared/types';
import { isSourceFresh } from './shared/data-freshness';
import { getDashboardData, isLocalDemoMode, syncNow } from './frontend/services/forge-api';

function publishDashboardData(data: DashboardDataResponse) {
  window.dispatchEvent(new CustomEvent('xone-source-data', { detail: data }));
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function failedSyncData(previous: DashboardDataResponse | null, message: string): DashboardDataResponse {
  const failedState = (source: DashboardDataResponse['state']['jira']) => source.state === 'not-configured'
    ? source
    : { ...source, state: 'error' as const, count: 0, message };
  return {
    snapshot: previous?.snapshot ?? null,
    state: {
      jira: failedState(previous?.state.jira ?? { state: 'not-synced', count: 0, message }),
      confluence: failedState(previous?.state.confluence ?? { state: 'not-synced', count: 0, message }),
      bitbucket: failedState(previous?.state.bitbucket ?? { state: 'not-synced', count: 0, message }),
      ...(previous?.state.syncedAt ? { syncedAt: previous.state.syncedAt } : {}),
    },
  };
}

export default function ForgeIntegrationStatus() {
  const [data, setData] = useState<DashboardDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    function handleSyncRequest(event: Event) {
      event.preventDefault();
      void refresh();
    }

    async function load() {
      try {
        const result = await getDashboardData();
        if (!active) return;
        setData(result);
        publishDashboardData(result);
        if (!result.snapshot) {
          const synced = await syncNow();
          if (!active) return;
          setData(synced);
          publishDashboardData(synced);
        }
      } catch (reason) {
        if (active) {
          const message = errorMessage(reason, 'Could not load Jira data.');
          setError(message);
          publishDashboardData({
            snapshot: null,
            state: {
              jira: { state: 'error', count: 0, message },
              confluence: { state: 'not-synced', count: 0, message: 'Source status is unavailable.' },
              bitbucket: { state: 'not-synced', count: 0, message: 'Source status is unavailable.' },
            },
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    window.addEventListener('xone-sync-request', handleSyncRequest);
    void load();
    return () => {
      active = false;
      window.removeEventListener('xone-sync-request', handleSyncRequest);
    };
  }, []);

  async function refresh() {
    setSyncing(true);
    setError('');
    try {
      const result = await syncNow();
      setData(result);
      publishDashboardData(result);
    } catch (reason) {
      setError(errorMessage(reason, 'Jira synchronization failed.'));
      const failed = failedSyncData(data, errorMessage(reason, 'Source synchronization failed.'));
      setData(failed);
      publishDashboardData(failed);
    } finally {
      setSyncing(false);
    }
  }

  const jiraIssueCount = data?.snapshot?.jiraIssues.length ?? 0;
  const sources = [
    ['Jira', data?.state.jira],
    ['Confluence', data?.state.confluence],
    ['Bitbucket', data?.state.bitbucket],
  ] as const;
  const syncError = error || sources
    .filter(([, source]) => source?.state === 'error')
    .map(([, source]) => source?.message)
    .filter(Boolean)
    .join(' · ');
  const sourceStatusText = sources
    .map(([name, source]) => {
      const syncedAt = source?.syncedAt ?? (name === 'Jira' ? data?.snapshot?.syncedAt : undefined);
      const stale = source && (source.state === 'connected' || source.state === 'partial') && !isSourceFresh(syncedAt);
      const state = stale ? 'stale' : source?.state ?? 'not-synced';
      return `${name} ${state}${source ? ` (${source.count})` : ''}`;
    })
    .join(' · ');
  const sourceStatusDetails = sources
    .map(([name, source]) => {
      const syncedAt = source?.syncedAt ?? (name === 'Jira' ? data?.snapshot?.syncedAt : undefined);
      return `${name}: ${source?.message ?? 'Status unavailable'}${syncedAt ? ` Last successful sync: ${new Date(syncedAt).toLocaleString()}.` : ''}`;
    })
    .join('\n');
  const statusText = loading
    ? 'Loading source data…'
    : error
      ? 'Source data unavailable'
      : sourceStatusText || `${jiraIssueCount} Jira issues`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      {isLocalDemoMode() && <span style={{ border: '1px solid #d97706', color: '#92400e', background: '#fffbeb', borderRadius: 6, padding: '3px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>LOCAL DEMO · SYNTHETIC DATA</span>}
      <span role="status" aria-live="polite" title={sourceStatusDetails}>
        {statusText}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={loading || syncing}
        aria-label="Synchronize Jira and connected sources"
      >
        {syncing ? 'Syncing…' : 'Sync'}
      </button>
      {syncError && (
        <span role="alert" title={syncError} style={{ color: '#b42318', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {syncError}
        </span>
      )}
    </div>
  );
}
