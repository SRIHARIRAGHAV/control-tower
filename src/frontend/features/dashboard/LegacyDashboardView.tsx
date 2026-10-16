import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import dashboardShell from '../../dashboard/dashboard-shell.html?raw';
import { initDashboard } from '../../dashboard/dashboard';
import ForgeIntegrationStatus from '../integrations/ForgeIntegrationStatus';
import '../../dashboard/dashboard.css';

function ForgeIntegrationStatusMount() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById('forge-status-slot'));
  }, []);

  return host ? createPortal(<ForgeIntegrationStatus />, host) : null;
}

export default function LegacyDashboardView() {
  useEffect(() => {
    initDashboard();
  }, []);

  return (
    <>
      <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: dashboardShell }} />
      <ForgeIntegrationStatusMount />
    </>
  );
}
