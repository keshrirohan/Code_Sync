import { useState } from 'react';

// ── LeetCode Card ─────────────────────────────────────────────────────────────

function LeetCodeCard({ config, onUpdate }) {
  const [cookie, setCookie]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);
  const isConnected = config?.hasLeetcodeCookie;

  async function handleConnect(e) {
    e.preventDefault();
    if (!cookie.trim()) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      const res  = await fetch('/api/auth/leetcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: cookie.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setSuccess(`Connected as ${data.username}`);
        setCookie('');
        onUpdate();
      } else {
        setError(data.error || 'Invalid cookie');
      }
    } catch {
      setError('Failed to reach the server');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await fetch('/api/auth/leetcode', { method: 'DELETE' });
      setSuccess(null); setError(null);
      onUpdate();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`card${isConnected ? ' connected' : ''}`}>
      <div className="card-header">
        <div className="card-title-row">
          <div className="card-icon lc">🟡</div>
          <div>
            <div className="card-label">LeetCode</div>
            <div className="card-sublabel">Session cookie</div>
          </div>
        </div>
        <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
          <div className="badge-dot" />
          {isConnected ? 'Connected' : 'Not connected'}
        </div>
      </div>

      {isConnected ? (
        <>
          <div className="profile-row">
            <span style={{ fontSize: 20 }}>👤</span>
            <div>
              <div className="profile-name">{config.leetcodeUsername}</div>
              <div className="profile-platform">LeetCode account</div>
            </div>
          </div>
          <div className="alert info mb-16">
            <span className="alert-icon">💡</span>
            <span>Your submissions will be fetched from this account.</span>
          </div>
          <button className="btn btn-danger" onClick={handleDisconnect} disabled={loading}>
            {loading ? <span className="spinner" /> : '✕'} Disconnect
          </button>
        </>
      ) : (
        <form onSubmit={handleConnect}>
          <div className="form-group">
            <label className="form-label">Session Cookie</label>
            <textarea
              className="textarea"
              rows={3}
              placeholder="LEETCODE_SESSION=eyJhbGc...; csrftoken=abc123..."
              value={cookie}
              onChange={e => setCookie(e.target.value)}
            />
            <div className="form-hint">
              Get this from LeetCode → F12 → Application → Cookies.{' '}
              <a href="https://leetcode.com" target="_blank" rel="noreferrer">Open LeetCode ↗</a>
            </div>
          </div>

          {error   && <div className="alert error mb-16"><span className="alert-icon">✕</span>{error}</div>}
          {success && <div className="alert success mb-16"><span className="alert-icon">✓</span>{success}</div>}

          <div className="flex-row">
            <button className="btn btn-primary" type="submit" disabled={loading || !cookie.trim()}>
              {loading ? <span className="spinner" /> : '⚡'} Validate &amp; Connect
            </button>
            <span className="text-sm text-muted">Or use the Chrome Extension →</span>
          </div>
        </form>
      )}
    </div>
  );
}

// ── GitHub Card ───────────────────────────────────────────────────────────────

function GitHubCard({ config, onUpdate }) {
  const [token, setToken]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const isConnected = config?.hasGithubToken;

  async function handleConnect(e) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      const res  = await fetch('/api/auth/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setSuccess(`Connected as ${data.username}`);
        setToken('');
        onUpdate();
      } else {
        setError(data.error || 'Invalid token');
      }
    } catch {
      setError('Failed to reach the server');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await fetch('/api/auth/github', { method: 'DELETE' });
      setSuccess(null); setError(null);
      onUpdate();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`card${isConnected ? ' connected' : ''}`}>
      <div className="card-header">
        <div className="card-title-row">
          <div className="card-icon gh">🐙</div>
          <div>
            <div className="card-label">GitHub</div>
            <div className="card-sublabel">Personal Access Token</div>
          </div>
        </div>
        <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
          <div className="badge-dot" />
          {isConnected ? 'Connected' : 'Not connected'}
        </div>
      </div>

      {isConnected ? (
        <>
          <div className="profile-row">
            {config.githubAvatar ? (
              <img src={config.githubAvatar} alt="avatar" className="profile-avatar" />
            ) : (
              <span style={{ fontSize: 22 }}>🐙</span>
            )}
            <div>
              <div className="profile-name">@{config.githubUsername}</div>
              <div className="profile-platform">GitHub account</div>
            </div>
          </div>
          <div className="alert info mb-16">
            <span className="alert-icon">💡</span>
            <span>Repositories will be fetched from this account.</span>
          </div>
          <button className="btn btn-danger" onClick={handleDisconnect} disabled={loading}>
            {loading ? <span className="spinner" /> : '✕'} Disconnect
          </button>
        </>
      ) : (
        <form onSubmit={handleConnect}>
          <div className="form-group">
            <label className="form-label">Personal Access Token</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showToken ? 'text' : 'password'}
                className="input"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={e => setToken(e.target.value)}
                style={{ paddingRight: '60px' }}
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-4)', fontSize: 12, fontFamily: 'Inter, sans-serif',
                }}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="form-hint">
              Needs <code style={{ fontFamily: 'monospace', color: 'var(--violet-light)' }}>repo</code> scope.{' '}
              <a
                href="https://github.com/settings/tokens/new?description=CodeSync&scopes=repo"
                target="_blank"
                rel="noreferrer"
              >
                Create token ↗
              </a>
            </div>
          </div>

          {error   && <div className="alert error mb-16"><span className="alert-icon">✕</span>{error}</div>}
          {success && <div className="alert success mb-16"><span className="alert-icon">✓</span>{success}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading || !token.trim()}>
            {loading ? <span className="spinner" /> : '🐙'} Validate &amp; Connect
          </button>
        </form>
      )}
    </div>
  );
}

// ── Extension Tip ─────────────────────────────────────────────────────────────

function ExtensionTip() {
  return (
    <div className="alert info" style={{ marginTop: 24 }}>
      <span className="alert-icon">🧩</span>
      <div>
        <strong>Chrome Extension available!</strong> Load the{' '}
        <code style={{ fontFamily: 'monospace', color: 'var(--violet-light)' }}>/extension</code>{' '}
        folder as an unpacked extension to auto-capture your LeetCode cookie — no DevTools needed.
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ConnectSection({ config, onUpdate }) {
  const bothConnected = config?.hasLeetcodeCookie && config?.hasGithubToken;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Connect Accounts</h1>
        <p className="page-subtitle">
          Link your LeetCode session and GitHub Personal Access Token to enable syncing.
        </p>
      </div>

      {bothConnected && (
        <div className="alert success mb-24">
          <span className="alert-icon">✅</span>
          <span>Both accounts connected! Head to <strong>Repository</strong> to pick where to sync.</span>
        </div>
      )}

      <div className="grid-2">
        <LeetCodeCard config={config} onUpdate={onUpdate} />
        <GitHubCard   config={config} onUpdate={onUpdate} />
      </div>

      <ExtensionTip />
    </div>
  );
}
