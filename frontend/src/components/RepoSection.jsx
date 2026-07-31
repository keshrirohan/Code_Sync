import { useState, useEffect, useCallback } from 'react';

export default function RepoSection({ config, onUpdate }) {
  const [repos, setRepos]             = useState([]);
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [selected, setSelected]       = useState(config?.targetRepoUrl || null);
  const [selectedName, setSelectedName] = useState(config?.targetRepoName || null);
  const [error, setError]             = useState(null);
  const [saved, setSaved]             = useState(false);

  const fetchRepos = useCallback(async () => {
    if (!config?.hasGithubToken) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/repos');
      const data = await res.json();
      if (res.ok) {
        setRepos(data);
      } else {
        setError(data.error || 'Failed to load repos');
      }
    } catch {
      setError('Failed to reach the server');
    } finally {
      setLoading(false);
    }
  }, [config?.hasGithubToken]);

  useEffect(() => { fetchRepos(); }, [fetchRepos]);

  // Update local selection when config changes
  useEffect(() => {
    setSelected(config?.targetRepoUrl || null);
    setSelectedName(config?.targetRepoName || null);
  }, [config]);

  const filtered = repos.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.description?.toLowerCase().includes(search.toLowerCase())
  );

  function handleSelect(repo) {
    setSelected(repo.url);
    setSelectedName(repo.name);
    setSaved(false);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch('/api/repos/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: selected, repoName: selectedName }),
      });
      setSaved(true);
      onUpdate();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save selection');
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  if (!config?.hasGithubToken) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Choose Repository</h1>
          <p className="page-subtitle">Select the GitHub repository to push your submissions into.</p>
        </div>
        <div className="alert warn">
          <span className="alert-icon">⚠️</span>
          <span>Connect your GitHub account first to see your repositories.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="flex-between">
          <div>
            <h1 className="page-title">Choose Repository</h1>
            <p className="page-subtitle">
              Select where your LeetCode submissions will be committed.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={fetchRepos}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* Current selection banner */}
      {config?.targetRepoUrl && (
        <div className="alert success mb-24">
          <span className="alert-icon">📁</span>
          <span>
            Currently syncing to: <strong>{config.targetRepoName || config.targetRepoUrl}</strong>
          </span>
        </div>
      )}

      {error && (
        <div className="alert error mb-24">
          <span className="alert-icon">✕</span>
          {error}
        </div>
      )}

      <div className="card">
        {/* Search */}
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search repositories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Repo list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
            <p>Loading repositories...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>{search ? 'No matching repos' : 'No repositories found'}</h3>
            <p>{search ? 'Try a different search term.' : 'Make sure your token has repo access.'}</p>
          </div>
        ) : (
          <div className="repo-list">
            {filtered.map(repo => {
              const isSelected = selected === repo.url;
              return (
                <div
                  key={repo.url}
                  className={`repo-item${isSelected ? ' selected' : ''}`}
                  onClick={() => handleSelect(repo)}
                >
                  <div className="repo-radio">
                    <div className="repo-radio-inner" />
                  </div>
                  <div className="repo-info">
                    <div className="repo-name">{repo.name}</div>
                    {repo.description && (
                      <div className="repo-desc">{repo.description}</div>
                    )}
                  </div>
                  <div className="repo-tags">
                    <span className={`tag ${repo.private ? 'tag-private' : 'tag-public'}`}>
                      {repo.private ? '🔒 Private' : '🌐 Public'}
                    </span>
                    {repo.updatedAt && (
                      <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
                        {formatDate(repo.updatedAt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        {!loading && filtered.length > 0 && (
          <div className="flex-row mt-16" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !selected || selected === config?.targetRepoUrl}
            >
              {saving ? <span className="spinner" /> : '💾'} Save Selection
            </button>
            {saved && (
              <div className="alert success" style={{ padding: '7px 12px', margin: 0 }}>
                <span>✓ Repository saved!</span>
              </div>
            )}
            {selected && (
              <span className="text-sm text-muted" style={{ marginLeft: 'auto' }}>
                {filtered.length} repos · {selected === config?.targetRepoUrl ? 'Current selection' : 'Unsaved'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
