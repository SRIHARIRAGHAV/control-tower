import { useEffect, useState } from 'react';
import type { DashboardDataResponse } from './shared/types';
import { getDashboardData, syncNow } from './frontend/services/forge-api';

function publishDashboardData(data: DashboardDataResponse) {
  window.dispatchEvent(new CustomEvent('xone-source-data', { detail: data }));
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
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
    } finally {
      setSyncing(false);
    }
  }

  const jiraStatus = data?.state.jira;
  const jiraIssueCount = data?.snapshot?.jiraIssues.length ?? 0;
  const syncError = error || (jiraStatus?.state === 'error' ? jiraStatus.message : '');
  const statusText = loading
    ? 'Loading Jira data…'
    : error
      ? 'Jira data unavailable'
      : jiraStatus?.state === 'error'
        ? `Jira sync failed · showing ${jiraIssueCount} cached issues`
        : jiraStatus?.state === 'not-configured'
          ? 'Jira is not configured'
          : jiraStatus?.state === 'not-synced'
            ? 'Jira has not synced'
            : `${jiraIssueCount} Jira issues`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span role="status" aria-live="polite">
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
