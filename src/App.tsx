import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import dashboardShell from './dashboard-shell.html?raw';
import { initDashboard } from './dashboard';
import ForgeIntegrationStatus from './ForgeIntegrationStatus';
import { getAuthStatus } from './frontend/services/forge-api';
import type { AuthStatusResponse } from './shared/types';
import './dashboard.css';

export default function App() {
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);
  const [access, setAccess] = useState<AuthStatusResponse | null>(null);

  useEffect(() => {
    let active = true;
    void getAuthStatus().then((result) => {
      if (!active) return;
      setAccess(result);
    }).catch(() => {
      if (active) {
        setAccess({
          authenticated: false,
          authorized: false,
          role: null,
          canSync: false,
          canWrite: false,
          code: 'AUTH_STATUS_UNAVAILABLE',
        });
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!access?.authorized) return;
    initDashboard();
    const slot = document.getElementById('forge-status-slot');
    if (!slot) throw new Error('Forge integration status slot was not found');
    setStatusSlot(slot);
  }, [access?.authorized]);

  if (!access) return <p role="status">Verifying Jira access…</p>;
  if (!access.authorized) {
    return (
      <main role="alert" aria-labelledby="access-denied-title" style={{ maxWidth: 560, margin: '10vh auto', padding: 24 }}>
        <h1 id="access-denied-title">Access denied</h1>
        <p>
          {access.code === 'AUTH_STATUS_UNAVAILABLE'
            ? 'Unable to verify Jira access right now. Refresh the page or contact your app administrator.'
            : 'Your Jira account is not authorized to use Control Tower. Contact your app administrator if you need access.'}
        </p>
      </main>
    );
  }

  return (
    <>
      <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: dashboardShell }} />
      {statusSlot && createPortal(<ForgeIntegrationStatus canSync={access.canSync} />, statusSlot)}
    </>
  );
}
