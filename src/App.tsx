import { useEffect } from 'react';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import dashboardShell from './dashboard-shell.html?raw';
import { initDashboard } from './dashboard';
import './dashboard.css';

export default function App() {
  useEffect(() => {
    initDashboard();
  }, []);

  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: dashboardShell }} />;
}
