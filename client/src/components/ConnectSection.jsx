import { useState, useEffect } from 'react';

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
            <div className="card-sublabel">Session cookie or extension</div>
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
          <div className="alert info mb-16" style={{ fontSize: 12, lineHeight: 1.6 }}>
            <span className="alert-icon">ℹ️</span>
            <div>
              <strong>Quick setup instructions:</strong>
              <br />
              1. Log in to <a href="https://leetcode.com" target="_blank" rel="noreferrer">leetcode.com ↗</a>
              <br />
              2. Open DevTools (<code>F12</code>) → <strong>Application</strong> → <strong>Cookies</strong> → <code>https://leetcode.com</code>
              <br />
              3. Copy the <code>LEETCODE_SESSION</code> cookie value and paste it below.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Session Cookie or Session ID</label>
            <textarea
              className="textarea"
              rows={2}
              placeholder="LEETCODE_SESSION=eyJhbGc... or eyJhbGc..."
              value={cookie}
              onChange={e => setCookie(e.target.value)}
            />
          </div>

          {error   && <div className="alert error mb-16"><span className="alert-icon">✕</span>{error}</div>}
          {success && <div className="alert success mb-16"><span className="alert-icon">✓</span>{success}</div>}

          <div className="flex-row">
            <button className="btn btn-primary" type="submit" disabled={loading || !cookie.trim()}>
              {loading ? <span className="spinner" /> : '⚡'} Validate &amp; Connect
            </button>
            <span className="text-sm text-muted">Or use Chrome Extension →</span>
          </div>
        </form>
      )}
    </div>
  );
}

// ── GitHub Card ───────────────────────────────────────────────────────────────

function GitHubOAuthSetup({ onConfigured }) {
  const [clientId, setClientId]         = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/auth/github/oauth-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      const data = await res.json();
      if (data.ok) { onConfigured(); }
      else { setError(data.error || 'Failed to save'); }
    } catch {
      setError('Failed to reach the server');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="alert info mb-16">
        <span className="alert-icon">ℹ️</span>
        <div>
          <strong>GitHub OAuth App Setup:</strong>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: '12px 14px', background: 'rgba(0,0,0,0.2)',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7,
        }}>
          <div><span style={{ color: 'var(--violet-light)', fontWeight: 600 }}>1.</span>{' '}
            Go to{' '}
            <a href="https://github.com/settings/applications/new" target="_blank" rel="noreferrer"
              style={{ color: 'var(--violet-light)' }}>
              GitHub → Developer Settings → OAuth Apps → New OAuth App
            </a>
          </div>
          <div><span style={{ color: 'var(--violet-light)', fontWeight: 600 }}>2.</span>{' '}
            Application name: <strong>CodeSync</strong>, Homepage URL:{' '}
            <code style={{ fontFamily: 'monospace', color: 'var(--emerald-light)' }}>http://localhost:3055</code>
          </div>
          <div><span style={{ color: 'var(--violet-light)', fontWeight: 600 }}>3.</span>{' '}
            Authorization callback URL:{' '}
            <code style={{ fontFamily: 'monospace', color: 'var(--emerald-light)' }}>http://localhost:3055/api/auth/github/callback</code>
          </div>
          <div><span style={{ color: 'var(--violet-light)', fontWeight: 600 }}>4.</span>{' '}
            Paste the <strong>Client ID</strong> and generate/paste a <strong>Client Secret</strong> below.
          </div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="form-group">
          <label className="form-label">Client ID</label>
          <input
            type="text"
            className="input"
            placeholder="Ov23li..."
            value={clientId}
            onChange={e => setClientId(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Client Secret</label>
          <input
            type="password"
            className="input"
            placeholder="••••••••••••••••••••••••••••••••••••••••"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
          />
        </div>
        {error && <div className="alert error mb-16"><span className="alert-icon">✕</span>{error}</div>}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={saving || !clientId.trim() || !clientSecret.trim()}
        >
          {saving ? <span className="spinner" /> : '💾'} Save &amp; Enable Sign-in
        </button>
      </form>
    </div>
  );
}

function GitHubCard({ config, onUpdate }) {
  const [oauthStatus, setOauthStatus] = useState(null); // { configured, connected }
  const [usePat, setUsePat]           = useState(true); // Default to PAT for fast token auth
  const [token, setToken]             = useState('');
  const [showToken, setShowToken]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [patError, setPatError]       = useState(null);
  const isConnected = config?.hasGithubToken;

  // Load OAuth status
  useEffect(() => {
    fetch('/api/auth/github/oauth-status')
      .then(r => r.json())
      .then(setOauthStatus)
      .catch(() => setOauthStatus({ configured: false, connected: false }));
  }, [config]);

  async function handleDisconnect() {
    setLoading(true);
    try {
      await fetch('/api/auth/github', { method: 'DELETE' });
      onUpdate();
    } finally {
      setLoading(false);
    }
  }

  async function handlePATConnect(e) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true); setPatError(null);
    try {
      const res  = await fetch('/api/auth/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (data.valid) { setToken(''); onUpdate(); }
      else { setPatError(data.error || 'Invalid token'); }
    } catch {
      setPatError('Failed to reach the server');
    } finally {
      setLoading(false);
    }
  }

  const ghIconStyles = {
    width: 22, height: 22, viewBox: '0 0 24 24', fill: 'currentColor',
  };

  function GitHubIcon() {
    return (
      <svg {...ghIconStyles} style={{ width: 18, height: 18, flexShrink: 0 }}>
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    );
  }

  return (
    <div className={`card${isConnected ? ' connected' : ''}`}>
      <div className="card-header">
        <div className="card-title-row">
          <div className="card-icon gh">🐙</div>
          <div>
            <div className="card-label">GitHub</div>
            <div className="card-sublabel">
              {usePat ? 'Personal Access Token' : 'OAuth App'}
            </div>
          </div>
        </div>
        <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
          <div className="badge-dot" />
          {isConnected ? 'Connected' : 'Not connected'}
        </div>
      </div>

      {isConnected ? (
        /* ── Connected state ── */
        <>
          <div className="profile-row">
            {config.githubAvatar
              ? <img src={config.githubAvatar} alt="avatar" className="profile-avatar" />
              : <span style={{ fontSize: 22 }}>🐙</span>
            }
            <div>
              <div className="profile-name">@{config.githubUsername}</div>
              <div className="profile-platform">GitHub account connected</div>
            </div>
          </div>
          <div className="alert success mb-16">
            <span className="alert-icon">✅</span>
            <span>Signed in with GitHub. Repositories will be listed from this account.</span>
          </div>
          <button className="btn btn-danger" onClick={handleDisconnect} disabled={loading}>
            {loading ? <span className="spinner" /> : '✕'} Disconnect
          </button>
        </>
      ) : (
        /* ── Not connected state ── */
        <>
          {/* Method selector tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${usePat ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setUsePat(true)}
              style={{ flex: 1 }}
            >
              🔑 Personal Access Token
            </button>
            <button
              type="button"
              className={`btn btn-sm ${!usePat ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setUsePat(false)}
              style={{ flex: 1 }}
            >
              🌐 OAuth Login
            </button>
          </div>

          {usePat ? (
            /* ── PAT Mode ── */
            <form onSubmit={handlePATConnect}>
              <div className="alert info mb-16" style={{ fontSize: 12, lineHeight: 1.6 }}>
                <span className="alert-icon">💡</span>
                <div>
                  <strong>Recommended (Instant 1-Click Setup):</strong>
                  <br />
                  Generate a Personal Access Token with <code>repo</code> scope to allow CodeSync to push to your repository.
                  <br />
                  <a
                    href="https://github.com/settings/tokens/new?description=CodeSync&scopes=repo"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--violet-light)', fontWeight: 600, marginTop: 4, display: 'inline-block' }}
                  >
                    Click here to generate token on GitHub ↗
                  </a>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Personal Access Token</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showToken ? 'text' : 'password'}
                    className="input"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_..."
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    style={{ paddingRight: 60 }}
                  />
                  <button type="button" onClick={() => setShowToken(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {patError && <div className="alert error mb-16"><span className="alert-icon">✕</span>{patError}</div>}
              <button className="btn btn-primary" type="submit" disabled={loading || !token.trim()}>
                {loading ? <span className="spinner" /> : '🔑'} Connect with Token
              </button>
            </form>
          ) : oauthStatus?.configured ? (
            /* ── OAuth Configured Mode ── */
            <>
              <div className="alert info mb-16">
                <span className="alert-icon">✅</span>
                <span>OAuth App configured. Click below to sign in with GitHub.</span>
              </div>
              <a
                href="/api/auth/github/login"
                className="btn btn-primary btn-lg"
                style={{ display: 'flex', textDecoration: 'none', marginBottom: 12 }}
              >
                <GitHubIcon />
                Sign in with GitHub
              </a>
            </>
          ) : (
            /* ── OAuth Setup Form ── */
            <GitHubOAuthSetup onConfigured={() => {
              setOauthStatus(s => ({ ...s, configured: true }));
            }} />
          )}
        </>
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
