import { useState, useEffect, useCallback } from 'react';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(start, end) {
  if (!start || !end) return '—';
  const ms = new Date(end) - new Date(start);
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function HistorySection() {
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [deleting, setDeleting] = useState(null); // id being deleted

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/history');
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  async function handleDelete(id) {
    setDeleting(id);
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      setHistory(prev => prev.filter(h => h.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  // Stats
  const total    = history.length;
  const lastSync = history[0];
  const successes = history.filter(h => h.status === 'success').length;

  return (
    <div className="page">
      <div className="page-header">
        <div className="flex-between">
          <div>
            <h1 className="page-title">Sync History</h1>
            <p className="page-subtitle">A record of every sync run you've performed.</p>
          </div>
          <button className="btn btn-secondary" onClick={fetchHistory} disabled={loading}>
            {loading ? <span className="spinner" /> : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-number">{total}</div>
          <div className="stat-label">Total Syncs</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: 'var(--emerald-light)' }}>
            {successes}
          </div>
          <div className="stat-label">Successful</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ fontSize: 16, paddingTop: 6 }}>
            {lastSync ? formatDate(lastSync.completedAt).split(',')[0] : '—'}
          </div>
          <div className="stat-label">Last Sync</div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-3)' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
          <p>Loading history...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="history-table-wrap">
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>No syncs yet</h3>
            <p>Run your first sync from the Sync tab to see history here.</p>
          </div>
        </div>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Repository</th>
                <th>Status</th>
                <th>Type</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map(entry => (
                <tr key={entry.id}>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                      {formatDate(entry.completedAt || entry.startedAt)}
                    </div>
                  </td>
                  <td>
                    <div
                      title={entry.repoUrl}
                      style={{
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12,
                        color: 'var(--violet-light)',
                      }}
                    >
                      {entry.repoName || entry.repoUrl || '—'}
                    </div>
                  </td>
                  <td>
                    <span className={`history-status ${entry.status}`}>
                      {entry.status === 'success' ? '✓ Success' : '✕ Failed'}
                    </span>
                  </td>
                  <td>
                    {entry.dryRun ? (
                      <span className="history-status dry">🔍 Dry Run</span>
                    ) : (
                      <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Full Sync</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-3)', fontSize: 12 }}>
                    {formatDuration(entry.startedAt, entry.completedAt)}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deleting === entry.id}
                      title="Delete this entry"
                    >
                      {deleting === entry.id ? <span className="spinner" /> : '🗑'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
