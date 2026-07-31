import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ConnectSection from './components/ConnectSection';
import RepoSection from './components/RepoSection';
import SyncSection from './components/SyncSection';
import HistorySection from './components/HistorySection';

export default function App() {
  const [page, setPage] = useState('connect');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshConfig = useCallback(async () => {
    try {
      const res  = await fetch('/api/config');
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      console.error('Failed to load config:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshConfig(); }, [refreshConfig]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Connecting to CodeSync...</p>
      </div>
    );
  }

  const isFullyConnected =
    config?.hasLeetcodeCookie && config?.hasGithubToken && config?.targetRepoUrl;

  return (
    <div className="app">
      <Sidebar
        page={page}
        setPage={setPage}
        config={config}
        isFullyConnected={isFullyConnected}
      />
      <main className="main-content">
        {page === 'connect' && (
          <ConnectSection config={config} onUpdate={refreshConfig} />
        )}
        {page === 'repo' && (
          <RepoSection config={config} onUpdate={refreshConfig} />
        )}
        {page === 'sync' && (
          <SyncSection config={config} isReady={!!isFullyConnected} />
        )}
        {page === 'history' && <HistorySection />}
      </main>
    </div>
  );
}
