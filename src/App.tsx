import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import dashboardShell from './dashboard-shell.html?raw';
import { initDashboard } from './dashboard';
import ForgeIntegrationStatus from './ForgeIntegrationStatus';
import './dashboard.css';

export default function App() {
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    initDashboard();
    const slot = document.getElementById('forge-status-slot');
    if (!slot) throw new Error('Forge integration status slot was not found');
    setStatusSlot(slot);
  }, []);

  return (
    <>
      <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: dashboardShell }} />
      {statusSlot && createPortal(<ForgeIntegrationStatus />, statusSlot)}
    </>
  );
}
