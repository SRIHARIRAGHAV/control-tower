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
    let stopped = false;
    let checking = false;
    let checkTimer: number | undefined;

    async function verifyAccess() {
      if (!active || stopped || checking) return;
      checking = true;
      try {
        const result = await getAuthStatus();
        if (!active) return;
        setAccess(result);
        if (!result.authorized) {
          window.dispatchEvent(new Event('xone-access-revoked'));
          stopChecking();
        }
      } catch {
        if (!active) return;
        window.dispatchEvent(new Event('xone-access-revoked'));
        setAccess({
          authenticated: false,
          authorized: false,
          role: null,
          canSync: false,
          canWrite: false,
          code: 'AUTH_STATUS_UNAVAILABLE',
        });
        stopChecking();
      } finally {
        checking = false;
      }
    }

    function checkOnReturn() {
      if (document.visibilityState === 'visible') void verifyAccess();
    }

    function stopChecking() {
      stopped = true;
      if (checkTimer !== undefined) window.clearInterval(checkTimer);
      window.removeEventListener('focus', checkOnReturn);
      document.removeEventListener('visibilitychange', checkOnReturn);
    }

    checkTimer = window.setInterval(() => { void verifyAccess(); }, 60_000);
    window.addEventListener('focus', checkOnReturn);
    document.addEventListener('visibilitychange', checkOnReturn);
    void verifyAccess();
    return () => {
      active = false;
      stopChecking();
    };
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
            : access.code === 'AUTHENTICATION_REQUIRED'
              ? 'Sign in to Jira to access Control Tower.'
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
