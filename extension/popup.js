// ─── CodeSync Popup Controller ────────────────────────────────────────────────
// Manages the 3-view lifecycle: connect → repo → dashboard.
// storage.js, leetcode-parser.js, and github-api.js are loaded before this.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ─── View references ──────────────────────────────────────────────────────

  var $ = function(id) { return document.getElementById(id); };

  var viewLoading  = $('view-loading');
  var viewConnect  = $('view-connect');
  var viewRepo     = $('view-repo');
  var viewDash     = $('view-dash');

  var headerBadge  = $('header-badge');
  var headerStatus = $('header-status');

  // Connect view
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
  var toggleAutoSync   = $('toggle-auto-sync');
  var toggleFirstOnly  = $('toggle-first-only');
  var toggleReadme     = $('toggle-readme');
  var openRepoLink     = $('open-repo-link');
  var changeRepoBtn    = $('change-repo-btn');
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

      // Verify token
      try {
        cachedUser = await gh_getUser(cachedToken);
      } catch (err) {
        // Token invalid or network error
        await cs_clearToken();
        cachedToken = null;
        showOnly(viewConnect);
        updateHeaderBadge('disconnected');
        showPatError('Token invalid or expired. Please reconnect.');
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
    } else if (state === 'syncing') {
      headerBadge.classList.add('badge-warn');
      headerStatus.textContent = 'Syncing…';
    } else {
      headerBadge.classList.add('badge-err');
      headerStatus.textContent = 'Not connected';
    }
  }

  // ─── View switcher ────────────────────────────────────────────────────────

  function showOnly(view) {
    [viewLoading, viewConnect, viewRepo, viewDash].forEach(function(v) {
      if (v === view) v.classList.remove('hidden');
      else            v.classList.add('hidden');
    });
  }

  // ─── Connect view ─────────────────────────────────────────────────────────

  patInput.addEventListener('input', function() {
    var val = patInput.value.trim();
    connectBtn.disabled = val.length < 10;
    patError.classList.add('hidden');
  });

  connectBtn.addEventListener('click', async function() {
    var token = patInput.value.trim();
    if (!token) return;

    setBtnLoading(connectBtn, connectSpinner, connectText, true);
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
      showPatError(err.status === 401
        ? 'Invalid token. Check that it has repo scope and hasn\'t expired.'
        : 'Could not connect: ' + err.message);
    } finally {
      setBtnLoading(connectBtn, connectSpinner, connectText, false);
    }
  });

  function showPatError(msg) {
    patError.textContent = msg;
    patError.classList.remove('hidden');
  }

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
      repoSelect.innerHTML = '<option value="">Failed to load repos</option>';
    }
  }

  repoSelect.addEventListener('change', function() {
    saveRepoBtn.disabled = !repoSelect.value;
  });

  saveRepoBtn.addEventListener('click', async function() {
    if (!repoSelect.value) return;
    var repo = JSON.parse(repoSelect.value);
    await cs_setRepo({ owner: repo.fullName.split('/')[0], name: repo.name, fullName: repo.fullName, htmlUrl: repo.htmlUrl });
    cachedRepo = await cs_getRepo();
    await loadDashboard();
    showOnly(viewDash);
  });

  createRepoBtn.addEventListener('click', async function() {
    var name = (newRepoName.value || '').trim();
    if (!name) { newRepoName.focus(); return; }

    setBtnLoading(createRepoBtn, createSpinner, createText, true);
    try {
      var created = await gh_createRepo(cachedToken, name, newRepoPrivate.checked);
      await cs_setRepo({ owner: created.fullName.split('/')[0], name: created.name, fullName: created.fullName, htmlUrl: created.htmlUrl });
      cachedRepo = await cs_getRepo();
      // Clear SHA cache for the new repo
      await new Promise(function(r) { chrome.storage.local.set({ [CS_KEYS.SHA_CACHE]: {} }, r); });
      await loadDashboard();
      showOnly(viewDash);
    } catch (err) {
      alert('Failed to create repo: ' + err.message);
    } finally {
      setBtnLoading(createRepoBtn, createSpinner, createText, false);
    }
  });

  disconnectBtnRepo.addEventListener('click', disconnect);

  // ─── Dashboard view ───────────────────────────────────────────────────────

  async function loadDashboard() {
    // Populate user+repo bar
    if (cachedUser && cachedRepo) {
      dashAvatar.src  = cachedUser.avatar_url || '';
      dashName.textContent  = cachedUser.name || cachedUser.login;
      dashRepo.textContent  = cachedRepo.fullName;
      openRepoLink.href = cachedUser && cachedRepo
        ? 'https://github.com/' + cachedRepo.fullName
        : '#';
    }

    // Stats
    var stats = await cs_getStats();
    statTotal.textContent  = stats.solved  || 0;
    statEasy.textContent   = stats.easy    || 0;
    statMedium.textContent = stats.medium  || 0;
    statHard.textContent   = stats.hard    || 0;

    // Last sync
    var last = await cs_getLastSync();
    if (last) {
      lsProblem.textContent = last.problemName || '';
      lsLang.textContent    = last.lang        || '';
      lsDiff.textContent    = last.difficulty  || '';
      lsTime.textContent    = last.ts ? timeAgo(last.ts) : '';

      var pillClass = last.status === 'SUCCESS' ? 'pill-success'
                    : last.status === 'SKIPPED' ? 'pill-skip'
                    : 'pill-error';
      lsStatusPill.className = 'pill ' + pillClass;
      lsStatusPill.textContent = last.status || '';

      if (last.commitUrl) {
        lsCommit.href = last.commitUrl;
        lsCommit.classList.remove('hidden');
      } else {
        lsCommit.classList.add('hidden');
      }
      lastSyncCard.classList.remove('hidden');
    } else {
      lastSyncCard.classList.add('hidden');
    }

    // Queue
    var queue = await cs_getQueue();
    if (queue.length > 0) {
      queueSize.textContent = queue.length;
      queueCard.classList.remove('hidden');
    } else {
      queueCard.classList.add('hidden');
    }

    // Settings
    var settings = await cs_getSettings();
    toggleAutoSync.checked  = !!settings.autoSync;
    toggleFirstOnly.checked = !!settings.onlyFirstSolve;
    toggleReadme.checked    = settings.commitReadme !== false;
  }

  // Toggle listeners
  toggleAutoSync.addEventListener('change', function() {
    cs_updateSettings({ autoSync: this.checked });
  });
  toggleFirstOnly.addEventListener('change', function() {
    cs_updateSettings({ onlyFirstSolve: this.checked });
  });
  toggleReadme.addEventListener('change', function() {
    cs_updateSettings({ commitReadme: this.checked });
  });

  flushBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({ type: 'FLUSH_QUEUE' }, function() {
      queueCard.classList.add('hidden');
    });
  });

  changeRepoBtn.addEventListener('click', async function() {
    cachedRepo = null;
    await cs_setRepo(null);
    await loadRepoPicker();
    populateUserCards(cachedUser);
    showOnly(viewRepo);
  });

  disconnectBtnDash.addEventListener('click', disconnect);
  openRepoLink.addEventListener('click', function(e) {
    if (!this.href || this.href === '#') e.preventDefault();
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────

  async function disconnect() {
    if (!confirm('Disconnect from GitHub? Your sync history will be kept.')) return;
    await cs_clearToken();
    await cs_setRepo(null);
    await new Promise(function(r) { chrome.storage.local.set({ [CS_KEYS.SHA_CACHE]: {} }, r); });
    cachedToken = null;
    cachedUser  = null;
    cachedRepo  = null;
    patInput.value = '';
    updateHeaderBadge('disconnected');
    showOnly(viewConnect);
  }

  // ─── Populate shared user card ────────────────────────────────────────────

  function populateUserCards(user) {
    if (!user) return;
    var av  = user.avatar_url || '';
    var nm  = user.name || user.login;
    var lg  = '@' + user.login;

    userAvatar.src = av; dashAvatar.src = av;
    userName.textContent  = nm;  dashName.textContent  = nm;
    userLogin.textContent = lg;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)   return 'Just now';
    var m = Math.floor(s / 60);
    if (m < 60)   return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24)   return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  function setBtnLoading(btn, spinner, textEl, loading) {
    btn.disabled = loading;
    if (loading) {
      textEl.classList.add('hidden');
      spinner.classList.remove('hidden');
    } else {
      textEl.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  }

  // ─── Start ────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();

})();
