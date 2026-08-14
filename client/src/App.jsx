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
  const [backendOffline, setBackendOffline] = useState(false);
  const [notification, setNotification] = useState(null); // { type, msg }

  const refreshConfig = useCallback(async () => {
    try {
      const res  = await fetch('/api/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data);
      setBackendOffline(false);
    } catch (e) {
      console.error('Failed to load config:', e);
      setBackendOffline(true);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle OAuth callback redirect params (?gh_connected=1 or ?gh_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gh_connected')) {
      setPage('repo');
      setNotification({ type: 'success', msg: 'GitHub connected successfully! Now choose a repository.' });
      window.history.replaceState({}, '', '/');
    } else if (params.get('gh_error')) {
      setNotification({ type: 'error', msg: `GitHub sign-in failed: ${decodeURIComponent(params.get('gh_error'))}` });
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Auto-dismiss notification after 6 seconds
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 6000);
    return () => clearTimeout(t);
  }, [notification]);

  useEffect(() => { refreshConfig(); }, [refreshConfig]);


  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Connecting to CodeSync...</p>
      </div>
    );
  }

  if (backendOffline) {
    return (
      <div className="loading-screen">
        <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: '#f87171', marginBottom: 12, fontSize: 20 }}>Backend Unavailable</h2>
          <p style={{ color: '#a1a1aa', lineHeight: 1.7, marginBottom: 20, fontSize: 14 }}>
            The CodeSync backend server is not running or cannot be reached.
          </p>
          <div style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '12px 16px', textAlign: 'left', marginBottom: 20,
            fontFamily: 'monospace', fontSize: 13, color: '#e4e4e7', lineHeight: 1.8,
          }}>
            <div style={{ color: '#71717a', marginBottom: 4 }}># Start the backend:</div>
            <div>cd server</div>
            <div>npm run dev</div>
          </div>
          <button
            onClick={() => { setLoading(true); refreshConfig(); }}
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff',
              border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            🔄 Retry Connection
          </button>
        </div>
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
        {/* Global notification toast (shown after OAuth redirect) */}
        {notification && (
          <div
            className={`alert ${notification.type}`}
            style={{
              position: 'fixed', top: 20, right: 20, zIndex: 1000,
              maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              animation: 'fadeInDown 0.3s ease',
            }}
          >
            <span className="alert-icon">{notification.type === 'success' ? '✅' : '❌'}</span>
            <span>{notification.msg}</span>
            <button
              onClick={() => setNotification(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', marginLeft: 8, fontSize: 14 }}
            >✕</button>
          </div>
        )}

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
