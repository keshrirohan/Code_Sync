// ─── CodeSync Popup Controller ────────────────────────────────────────────────
// Manages the 3-view lifecycle: connect → repo → dashboard.
// storage.js, leetcode-parser.js, and github-api.js are loaded before this.
//
// Auth flow:
//   1. User clicks "Sign in with GitHub"
//   2. chrome.identity.launchWebAuthFlow opens GitHub OAuth in a browser window
//   3. GitHub redirects to chrome.identity.getRedirectURL() with ?code=...
//   4. Extension sends { code, redirectUri } to POST /api/auth/github-token
//   5. Server exchanges code → access_token (client_secret stays on server)
//   6. Extension stores token, loads user info, shows repo picker
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ─── Configuration ────────────────────────────────────────────────────────
  // The CodeSync web app server — used for OAuth code exchange only.
  // GitHub API calls go directly to api.github.com (never through this server).
  var SERVER_BASE = 'http://localhost:3000'; // override via storage if needed

  // ─── View references ──────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }

  var viewLoading  = $('view-loading');
  var viewConnect  = $('view-connect');
  var viewRepo     = $('view-repo');
  var viewDash     = $('view-dash');

  var headerBadge  = $('header-badge');
  var headerStatus = $('header-status');

  // Connect view
  var oauthBtn      = $('oauth-btn');
  var oauthError    = $('oauth-error');
  var oauthSpinner  = oauthBtn.querySelector('.btn-spinner');
  var oauthText     = oauthBtn.querySelector('.btn-text');
  var patInput      = $('pat-input');
  var patError      = $('pat-error');
  var connectBtn    = $('connect-btn');
  var connectSpinner = connectBtn.querySelector('.btn-spinner');
  var connectText   = connectBtn.querySelector('.btn-text');

  // Repo view
  var userAvatar    = $('user-avatar');
  var userName      = $('user-name');
  var userLogin     = $('user-login');
  var repoSelect    = $('repo-select');
  var saveRepoBtn   = $('save-repo-btn');
  var createRepoBtn = $('create-repo-btn');
  var newRepoName   = $('new-repo-name');
  var newRepoPrivate = $('new-repo-private');
  var disconnectBtnRepo = $('disconnect-btn-repo');
  var createSpinner = createRepoBtn.querySelector('.btn-spinner');
  var createText    = createRepoBtn.querySelector('.btn-text');

  // Dashboard view
  var dashAvatar    = $('dash-avatar');
  var dashName      = $('dash-name');
  var dashRepo      = $('dash-repo');
  var statTotal     = $('stat-total');
  var statEasy      = $('stat-easy');
  var statMedium    = $('stat-medium');
  var statHard      = $('stat-hard');
  var lastSyncCard  = $('last-sync-card');
  var lsProblem     = $('ls-problem');
  var lsLang        = $('ls-lang');
  var lsDiff        = $('ls-diff');
  var lsTime        = $('ls-time');
  var lsCommit      = $('ls-commit');
  var lsStatusPill  = $('ls-status-pill');
  var queueCard     = $('queue-card');
  var queueSize     = $('queue-size');
  var flushBtn      = $('flush-queue-btn');
  var toggleAutoSync  = $('toggle-auto-sync');
  var toggleFirstOnly = $('toggle-first-only');
  var toggleReadme    = $('toggle-readme');
  var openRepoLink    = $('open-repo-link');
  var changeRepoBtn   = $('change-repo-btn');
  var disconnectBtnDash = $('disconnect-btn-dash');

  // ─── State ────────────────────────────────────────────────────────────────

  var cachedToken = null;
  var cachedUser  = null;
  var cachedRepo  = null;

  // ─── Boot ─────────────────────────────────────────────────────────────────

  async function boot() {
    showOnly(viewLoading);

    try {
      cachedToken = await cs_getToken();
      cachedRepo  = await cs_getRepo();

      if (!cachedToken) {
        showOnly(viewConnect);
        updateHeaderBadge('disconnected');
        return;
      }

      // Verify token still works
      try {
        cachedUser = await gh_getUser(cachedToken);
      } catch (err) {
        await cs_clearToken();
        cachedToken = null;
        showOnly(viewConnect);
        updateHeaderBadge('disconnected');
        showOAuthError('Session expired. Please sign in again.');
        return;
      }

      populateUserCards(cachedUser);
      updateHeaderBadge('connected');

      if (!cachedRepo) {
        await loadRepoPicker();
        showOnly(viewRepo);
      } else {
        await loadDashboard();
        showOnly(viewDash);
      }

    } catch (err) {
      console.error('[CodeSync Popup] Boot error:', err);
      showOnly(viewConnect);
      updateHeaderBadge('disconnected');
    }
  }

  // ─── Header badge ─────────────────────────────────────────────────────────

  function updateHeaderBadge(state) {
    headerBadge.className = 'badge';
    if (state === 'connected') {
      headerBadge.classList.add('badge-ok');
      headerStatus.textContent = 'Connected';
    } else {
      headerBadge.classList.add('badge-err');
      headerStatus.textContent = 'Not connected';
    }
  }

  function showOnly(view) {
    [viewLoading, viewConnect, viewRepo, viewDash].forEach(function(v) {
      if (v === view) v.classList.remove('hidden');
      else            v.classList.add('hidden');
    });
  }

  // ─── OAuth flow ───────────────────────────────────────────────────────────

  oauthBtn.addEventListener('click', startOAuthFlow);

  async function startOAuthFlow() {
    oauthError.classList.add('hidden');
    setBtnLoading(oauthBtn, oauthSpinner, oauthText, true, 'Connecting…');

    try {
      // 1. Get the chrome.identity redirect URI
      var redirectUri = chrome.identity.getRedirectURL();

      // 2. Ask our server for the GitHub OAuth URL (server provides client_id)
      var serverUrl = await getServerBase();
      var initRes = await fetch(
        serverUrl + '/api/auth/github-oauth-url?redirect_uri=' + encodeURIComponent(redirectUri)
      );
      if (!initRes.ok) {
        var initErr = await initRes.json().catch(function() { return {}; });
        throw new Error(initErr.error || 'Server error: could not get OAuth URL');
      }
      var initData = await initRes.json();
      var authUrl = initData.authUrl;

      // 3. Open GitHub OAuth popup via chrome.identity
      var resultUrl = await new Promise(function(resolve, reject) {
        chrome.identity.launchWebAuthFlow(
          { url: authUrl, interactive: true },
          function(responseUrl) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!responseUrl) {
              reject(new Error('Authorization cancelled'));
            } else {
              resolve(responseUrl);
            }
          }
        );
      });

      // 4. Extract code from redirect URL
      var params = new URL(resultUrl).searchParams;
      var code = params.get('code');
      if (!code) {
        var errParam = params.get('error_description') || params.get('error') || 'No code in redirect';
        throw new Error(errParam);
      }

      // 5. Exchange code → token via our server (client_secret stays server-side)
      var exchangeRes = await fetch(serverUrl + '/api/auth/github-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, redirectUri: redirectUri }),
      });
      if (!exchangeRes.ok) {
        var exchErr = await exchangeRes.json().catch(function() { return {}; });
        throw new Error(exchErr.error || 'Token exchange failed');
      }
      var exchData = await exchangeRes.json();
      var token = exchData.accessToken;
      if (!token) throw new Error('No access token returned from server');

      // 6. Verify token by fetching GitHub user
      var user = await gh_getUser(token);

      // 7. Persist token and proceed
      await cs_setToken(token);
      cachedToken = token;
      cachedUser  = user;

      populateUserCards(user);
      updateHeaderBadge('connected');
      await loadRepoPicker();
      showOnly(viewRepo);

    } catch (err) {
      console.error('[CodeSync] OAuth error:', err);
      showOAuthError(getOAuthErrorMessage(err));
    } finally {
      setBtnLoading(oauthBtn, oauthSpinner, oauthText, false, 'Sign in with GitHub');
    }
  }

  function getOAuthErrorMessage(err) {
    var msg = err.message || '';
    if (msg.includes('cancelled') || msg.includes('cancel') || msg.includes('closed')) {
      return 'Sign-in window was closed. Please try again.';
    }
    if (msg.includes('Server error') || msg.includes('not configured')) {
      return 'Server not reachable. Make sure the CodeSync web app is running at ' + (SERVER_BASE || 'localhost:3000');
    }
    if (msg.includes('bad_verification_code') || msg.includes('No code')) {
      return 'Authorization code expired. Please try again.';
    }
    return 'Sign-in failed: ' + msg;
  }

  function showOAuthError(msg) {
    oauthError.textContent = msg;
    oauthError.classList.remove('hidden');
  }

  // ─── Server base URL (reads from storage, fallback localhost) ─────────────

  function getServerBase() {
    return new Promise(function(r) {
      chrome.storage.local.get({ serverBase: 'http://localhost:3000' }, function(d) {
        SERVER_BASE = d.serverBase;
        r(d.serverBase);
      });
    });
  }

  // ─── PAT fallback ─────────────────────────────────────────────────────────

  patInput.addEventListener('input', function() {
    connectBtn.disabled = patInput.value.trim().length < 10;
    patError.classList.add('hidden');
  });

  connectBtn.addEventListener('click', async function() {
    var token = patInput.value.trim();
    if (!token) return;

    setBtnLoading(connectBtn, connectSpinner, connectText, true, 'Connecting…');
    patError.classList.add('hidden');

    try {
      var user = await gh_getUser(token);
      await cs_setToken(token);
      cachedToken = token;
      cachedUser  = user;
      patInput.value = '';

      populateUserCards(user);
      updateHeaderBadge('connected');
      await loadRepoPicker();
      showOnly(viewRepo);
    } catch (err) {
      patError.textContent = err.status === 401
        ? 'Invalid token — check it has the repo scope and hasn\'t expired.'
        : 'Could not connect: ' + err.message;
      patError.classList.remove('hidden');
    } finally {
      setBtnLoading(connectBtn, connectSpinner, connectText, false, 'Connect with PAT');
    }
  });

  // ─── Repo view ────────────────────────────────────────────────────────────

  async function loadRepoPicker() {
    repoSelect.innerHTML = '<option value="">Loading repos…</option>';
    saveRepoBtn.disabled = true;

    try {
      var repos = await gh_listRepos(cachedToken);
      repoSelect.innerHTML = '<option value="">— Select a repository —</option>';
      repos.forEach(function(r) {
        var opt = document.createElement('option');
        opt.value = JSON.stringify(r);
        opt.textContent = r.name + (r.private ? ' 🔒' : '');
        repoSelect.appendChild(opt);
      });
    } catch (err) {
      repoSelect.innerHTML = '<option value="">Failed to load repos — ' + err.message + '</option>';
    }
  }

  repoSelect.addEventListener('change', function() {
    saveRepoBtn.disabled = !repoSelect.value;
  });

  saveRepoBtn.addEventListener('click', async function() {
    if (!repoSelect.value) return;
    var r = JSON.parse(repoSelect.value);
    await cs_setRepo({ owner: r.fullName.split('/')[0], name: r.name, fullName: r.fullName, htmlUrl: r.htmlUrl });
    cachedRepo = await cs_getRepo();
    // Invalidate SHA cache for new repo
    await new Promise(function(res) { chrome.storage.local.set({ [CS_KEYS.SHA_CACHE]: {} }, res); });
    await loadDashboard();
    showOnly(viewDash);
  });

  createRepoBtn.addEventListener('click', async function() {
    var name = (newRepoName.value || '').trim();
    if (!name) { newRepoName.focus(); return; }

    setBtnLoading(createRepoBtn, createSpinner, createText, true, 'Creating…');
    try {
      var created = await gh_createRepo(cachedToken, name, newRepoPrivate.checked);
      await cs_setRepo({ owner: created.fullName.split('/')[0], name: created.name, fullName: created.fullName, htmlUrl: created.htmlUrl });
      cachedRepo = await cs_getRepo();
      await new Promise(function(res) { chrome.storage.local.set({ [CS_KEYS.SHA_CACHE]: {} }, res); });
      await loadDashboard();
      showOnly(viewDash);
    } catch (err) {
      alert('Failed to create repo: ' + err.message);
    } finally {
      setBtnLoading(createRepoBtn, createSpinner, createText, false, 'Create Repository');
    }
  });

  disconnectBtnRepo.addEventListener('click', disconnect);

  // ─── Dashboard view ───────────────────────────────────────────────────────

  async function loadDashboard() {
    if (cachedUser && cachedRepo) {
      dashAvatar.src = cachedUser.avatar_url || '';
      dashName.textContent = cachedUser.name || cachedUser.login;
      dashRepo.textContent = cachedRepo.fullName;
      openRepoLink.href = 'https://github.com/' + cachedRepo.fullName;
    }

    var stats = await cs_getStats();
    statTotal.textContent  = stats.solved  || 0;
    statEasy.textContent   = stats.easy    || 0;
    statMedium.textContent = stats.medium  || 0;
    statHard.textContent   = stats.hard    || 0;

    var last = await cs_getLastSync();
    if (last) {
      lsProblem.textContent = last.problemName || '';
      lsLang.textContent    = last.lang        || '';
      lsDiff.textContent    = last.difficulty  || '';
      lsTime.textContent    = last.ts ? timeAgo(last.ts) : '';
      var pillCls = last.status === 'SUCCESS' ? 'pill-success'
                  : last.status === 'SKIPPED' ? 'pill-skip' : 'pill-error';
      lsStatusPill.className = 'pill ' + pillCls;
      lsStatusPill.textContent = last.status || '';
      if (last.commitUrl) { lsCommit.href = last.commitUrl; lsCommit.classList.remove('hidden'); }
      else                { lsCommit.classList.add('hidden'); }
      lastSyncCard.classList.remove('hidden');
    } else {
      lastSyncCard.classList.add('hidden');
    }

    var queue = await cs_getQueue();
    if (queue.length > 0) {
      queueSize.textContent = queue.length;
      queueCard.classList.remove('hidden');
    } else {
      queueCard.classList.add('hidden');
    }

    var settings = await cs_getSettings();
    toggleAutoSync.checked  = !!settings.autoSync;
    toggleFirstOnly.checked = !!settings.onlyFirstSolve;
    toggleReadme.checked    = settings.commitReadme !== false;
  }

  toggleAutoSync.addEventListener('change', function() { cs_updateSettings({ autoSync: this.checked }); });
  toggleFirstOnly.addEventListener('change', function() { cs_updateSettings({ onlyFirstSolve: this.checked }); });
  toggleReadme.addEventListener('change', function() { cs_updateSettings({ commitReadme: this.checked }); });

  flushBtn.addEventListener('click', function() {
    flushBtn.textContent = 'Retrying…';
    flushBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'FLUSH_QUEUE' }, function() {
      queueCard.classList.add('hidden');
      flushBtn.textContent = 'Retry now';
      flushBtn.disabled = false;
    });
  });

  changeRepoBtn.addEventListener('click', async function() {
    cachedRepo = null;
    await cs_setRepo(null);
    populateUserCards(cachedUser);
    await loadRepoPicker();
    showOnly(viewRepo);
  });

  disconnectBtnDash.addEventListener('click', disconnect);

  // ─── Disconnect ───────────────────────────────────────────────────────────

  async function disconnect() {
    if (!confirm('Disconnect from GitHub? Your sync history in the extension will be cleared.')) return;
    await cs_clearToken();
    await cs_setRepo(null);
    await new Promise(function(r) { chrome.storage.local.set({ [CS_KEYS.SHA_CACHE]: {} }, r); });
    cachedToken = null;
    cachedUser  = null;
    cachedRepo  = null;
    patInput.value = '';
    oauthError.classList.add('hidden');
    updateHeaderBadge('disconnected');
    showOnly(viewConnect);
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────

  function populateUserCards(user) {
    if (!user) return;
    var av = user.avatar_url || '';
    var nm = user.name || user.login;
    var lg = '@' + user.login;
    userAvatar.src = av; dashAvatar.src = av;
    userName.textContent  = nm; dashName.textContent  = nm;
    userLogin.textContent = lg;
  }

  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'Just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  function setBtnLoading(btn, spinner, textEl, loading, loadingLabel) {
    btn.disabled = loading;
    if (loading) {
      textEl.textContent = loadingLabel || textEl.textContent;
      spinner.classList.remove('hidden');
    } else {
      spinner.classList.add('hidden');
    }
  }

  // ─── Start ────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
