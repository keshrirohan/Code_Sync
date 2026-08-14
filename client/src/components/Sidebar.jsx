// Icons as simple SVG components
function IconConnect() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}
function IconRepo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
      <path d="M9 18c-4.51 2-5-2-7-2"/>
    </svg>
  );
}
function IconSync() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
      <path d="M16 16h5v5"/>
    </svg>
  );
}
function IconHistory() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
      <path d="M12 7v5l4 2"/>
    </svg>
  );
}

export default function Sidebar({ page, setPage, config, isFullyConnected }) {
  const lcConnected   = config?.hasLeetcodeCookie;
  const ghConnected   = config?.hasGithubToken;
  const repoSelected  = config?.targetRepoUrl;

  const nav = [
    {
      id: 'connect',
      label: 'Connect Accounts',
      Icon: IconConnect,
      badge: (lcConnected && ghConnected) ? 'Ready' : null,
      badgeType: (lcConnected && ghConnected) ? 'ok' : null,
    },
    {
      id: 'repo',
      label: 'Repository',
      Icon: IconRepo,
      badge: repoSelected ? config?.targetRepoName?.split('/')[1] || 'Selected' : 'Pick repo',
      badgeType: repoSelected ? 'ok' : 'warn',
    },
    {
      id: 'sync',
      label: 'Sync',
      Icon: IconSync,
      badge: isFullyConnected ? 'Ready' : 'Not ready',
      badgeType: isFullyConnected ? 'ok' : 'warn',
    },
    {
      id: 'history',
      label: 'Sync History',
      Icon: IconHistory,
    },
  ];

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">⚡</div>
        <div className="logo-text">
          <div className="logo-name">CodeSync</div>
          <div className="logo-tagline">LeetCode → GitHub</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-label">Navigation</div>
        {nav.map(({ id, label, Icon, badge, badgeType }) => (
          <div
            key={id}
            className={`nav-item${page === id ? ' active' : ''}`}
            onClick={() => setPage(id)}
          >
            <span className="nav-icon"><Icon /></span>
            <span className="nav-text">{label}</span>
            {badge && (
              <span className={`nav-badge${badgeType ? ` ${badgeType}` : ''}`}>
                {badge}
              </span>
            )}
          </div>
        ))}
      </nav>

      {/* Status footer */}
      <div className="sidebar-footer">
        <div className="connection-card">
          <div className="connection-title">Status</div>

          {!config ? (
            /* Backend unreachable — show distinct offline state */
            <>
              <div className="connection-row">
                <div className="conn-dot off" />
                <span className="conn-label">Backend</span>
                <span className="conn-value" style={{ color: '#f87171' }}>Offline</span>
              </div>
              <div className="connection-row">
                <div className="conn-dot off" />
                <span className="conn-label">LeetCode</span>
                <span className="conn-value">—</span>
              </div>
              <div className="connection-row">
                <div className="conn-dot off" />
                <span className="conn-label">GitHub</span>
                <span className="conn-value">—</span>
              </div>
            </>
          ) : (
            <>
              <div className="connection-row">
                <div className={`conn-dot ${lcConnected ? 'ok' : 'off'}`} />
                <span className="conn-label">LeetCode</span>
                <span className={`conn-value${lcConnected ? ' ok' : ''}`}>
                  {lcConnected ? config.leetcodeUsername : 'Not connected'}
                </span>
              </div>

              <div className="connection-row">
                <div className={`conn-dot ${ghConnected ? 'ok' : 'off'}`} />
                <span className="conn-label">GitHub</span>
                <span className={`conn-value${ghConnected ? ' ok' : ''}`}>
                  {ghConnected ? config.githubUsername : 'Not connected'}
                </span>
              </div>

              <div className="connection-row">
                <div className={`conn-dot ${repoSelected ? 'ok' : 'warn'}`} />
                <span className="conn-label">Repository</span>
                <span className={`conn-value${repoSelected ? ' ok' : ''}`}>
                  {repoSelected
                    ? (config.targetRepoName?.split('/')[1] || 'Selected')
                    : 'None'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
