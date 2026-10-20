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
        if (active) setError(errorMessage(reason, 'Could not load Jira data.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
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

  const jiraIssueCount = data?.snapshot?.jiraIssues.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span role="status" aria-live="polite">
        {loading ? 'Loading Jira data…' : error ? 'Jira data unavailable' : `${jiraIssueCount ?? 0} Jira issues`}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={loading || syncing}
        aria-label="Synchronize Jira and connected sources"
      >
        {syncing ? 'Syncing…' : 'Sync'}
      </button>
      {error && <span role="alert" style={{ color: '#b42318' }}>{error}</span>}
    </div>
  );
}
