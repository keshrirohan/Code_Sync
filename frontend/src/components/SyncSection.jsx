import { useState, useRef, useEffect } from 'react';

// Classify each log line for color coding in the terminal
function classifyLine(msg) {
  if (!msg || !msg.trim()) return 'muted';
  if (msg.includes('=== Phase') || msg.includes('===')) return 'phase';
  if (msg.includes('✅') || msg.includes('complete') || msg.includes('Push complete')) return 'success';
  if (msg.toLowerCase().includes('error') || msg.includes('FATAL')) return 'error';
  return 'default';
}

function Terminal({ lines, isRunning, jobStatus }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="terminal-wrap">
      <div className="terminal-header">
        <div className="term-dot" style={{ background: '#ff5f57' }} />
        <div className="term-dot" style={{ background: '#febc2e' }} />
        <div className="term-dot" style={{ background: '#28c840' }} />
        <span className="term-title">sync output</span>
        {jobStatus && (
          <span className={`term-status ${jobStatus}`}>
            {jobStatus === 'running' ? '● Running' : jobStatus === 'success' ? '✓ Done' : '✕ Failed'}
          </span>
        )}
      </div>
      <div className="progress-bar-wrap">
        <div
          className="progress-bar-fill"
          style={{ width: jobStatus === 'running' ? '60%' : jobStatus === 'success' ? '100%' : '0%' }}
        />
      </div>
      <div className="terminal" ref={ref}>
        {lines.length === 0 ? (
          <span className="term-line muted">
            Waiting for sync to start...{isRunning && <span className="term-cursor" />}
          </span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`term-line ${classifyLine(line)}`}>
              {line}
              {isRunning && i === lines.length - 1 && <span className="term-cursor" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReadinessItem({ icon, label, value, ok }) {
  return (
    <div className={`ready-item ${ok ? 'ok' : 'fail'}`}>
      <div className="ready-item-icon">{icon}</div>
      <div className="ready-item-label">{label}</div>
      <div className="ready-item-value">{value}</div>
    </div>
  );
}

export default function SyncSection({ config, isReady }) {
  const [dryRun, setDryRun]       = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [jobId, setJobId]         = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // 'running' | 'success' | 'error'
  const [lines, setLines]         = useState([]);
  const esRef = useRef(null);

  function startSSE(id) {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/api/sync/${id}/stream`);
    esRef.current = es;

    es.onmessage = e => {
      const event = JSON.parse(e.data);

      if (event.type === 'log') {
        // Split on newlines so each line renders separately
        const newLines = event.message.split('\n').filter(l => l.trim());
        setLines(prev => [...prev, ...newLines]);
      } else if (event.type === 'complete') {
        setJobStatus(event.success ? 'success' : 'error');
        setSyncing(false);
        es.close();
      } else if (event.type === 'error') {
        setLines(prev => [...prev, `ERROR: ${event.message}`]);
        setJobStatus('error');
        setSyncing(false);
        es.close();
      }
    };

    es.onerror = () => {
      if (jobStatus !== 'success' && jobStatus !== 'error') {
        setJobStatus('error');
        setSyncing(false);
      }
      es.close();
    };
  }

  async function handleStartSync() {
    setSyncing(true);
    setJobStatus('running');
    setLines([]);
    setJobId(null);

    try {
      const res  = await fetch('/api/sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLines([`ERROR: ${data.error || 'Failed to start sync'}`]);
        setJobStatus('error');
        setSyncing(false);
        return;
      }

      setJobId(data.jobId);
      startSSE(data.jobId);
    } catch (err) {
      setLines([`ERROR: ${err.message}`]);
      setJobStatus('error');
      setSyncing(false);
    }
  }

  // Cleanup SSE on unmount
  useEffect(() => () => esRef.current?.close(), []);

  const repoShort = config?.targetRepoName?.split('/').pop() || config?.targetRepoUrl || '—';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Sync Submissions</h1>
        <p className="page-subtitle">
          Fetch all your LeetCode accepted submissions and commit them with original timestamps.
        </p>
      </div>

      {/* Readiness bar */}
      <div className="readiness-bar">
        <ReadinessItem
          icon="🟡"
          label="LeetCode"
          value={config?.leetcodeUsername || 'Not connected'}
          ok={!!config?.hasLeetcodeCookie}
        />
        <ReadinessItem
          icon="🐙"
          label="GitHub"
          value={config?.githubUsername ? `@${config.githubUsername}` : 'Not connected'}
          ok={!!config?.hasGithubToken}
        />
        <ReadinessItem
          icon="📁"
          label="Repository"
          value={repoShort}
          ok={!!config?.targetRepoUrl}
        />
      </div>

      {!isReady && (
        <div className="alert warn mb-24">
          <span className="alert-icon">⚠️</span>
          <span>Complete all steps in <strong>Connect</strong> and <strong>Repository</strong> before syncing.</span>
        </div>
      )}

      {/* Sync controls */}
      <div className="sync-controls">
        <label className="toggle-wrap" onClick={() => !syncing && setDryRun(v => !v)}>
          <div className={`toggle ${dryRun ? 'on' : ''}`}>
            <div className="toggle-knob" />
          </div>
          <div>
            <div className="toggle-label">
              {dryRun ? '🧪 Test Mode  ON' : '🧪 Test Mode'}
            </div>
            <div className="toggle-sub">
              {dryRun
                ? 'Will only show what would sync — nothing pushed to GitHub'
                : 'Turn ON to safely test before pushing to GitHub'}
            </div>
          </div>
        </label>

        <button
          className={`btn btn-lg ${dryRun ? 'btn-secondary' : 'btn-primary'}`}
          disabled={!isReady || syncing}
          onClick={handleStartSync}
        >
          {syncing ? (
            <><span className="spinner" /> Syncing...</>
          ) : dryRun ? (
            <>🧪 Run Test (No Push)</>
          ) : (
            <>⚡ Start Sync</>
          )}
        </button>
      </div>

      {/* Terminal output */}
      {(syncing || lines.length > 0) && (
        <Terminal
          lines={lines}
          isRunning={syncing}
          jobStatus={jobStatus}
        />
      )}

      {/* Post-sync messages */}
      {jobStatus === 'success' && (
        <div className="alert success mt-16">
          <span className="alert-icon">✅</span>
          <span>
            {dryRun ? 'Dry run complete!' : 'Sync complete! Check your GitHub repo for new commits.'}
            {' '}Go to <strong>History</strong> to see the record.
          </span>
        </div>
      )}
      {jobStatus === 'error' && (
        <div className="alert error mt-16">
          <span className="alert-icon">✕</span>
          <span>Sync failed. Check the output above for details.</span>
        </div>
      )}
    </div>
  );
}
