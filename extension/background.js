// ─── CodeSync Background Service Worker ──────────────────────────────────────
// MV3 service worker — no persistent state, must use chrome.storage for everything.
//
// Responsibilities:
//   • Receive ACCEPTED_SUBMISSION from content.js
//   • Validate PAT + repo settings before committing
//   • Commit solution file + README to GitHub via github-api.js
//   • Update root README + stats
//   • Retry failed jobs via chrome.alarms (sq_ = sync queue functions)
//   • Update badge with sync status
// ─────────────────────────────────────────────────────────────────────────────

importScripts('storage.js', 'leetcode-parser.js', 'github-api.js');

var ALARM_NAME   = 'cs_queue_flush';
var MAX_RETRIES  = 5;
var BASE_BACKOFF = 3000; // ms

// ─── Installation ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      [CS_KEYS.SETTINGS]: { onlyFirstSolve: false, autoSync: true, commitReadme: true },
      [CS_KEYS.STATS]:    { solved: 0, easy: 0, medium: 0, hard: 0, lastSynced: null, recentSolves: [] },
      [CS_KEYS.QUEUE]:    [],
    });
    console.log('[CodeSync] Installed. Configure your GitHub PAT in the popup.');
  }

  // Register alarm for queue flushing (every 5 minutes)
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(function () {
  // Re-register alarm on browser startup (alarms survive restarts, but just in case)
  chrome.alarms.get(ALARM_NAME, function (a) {
    if (!a) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
  });
});

// ─── Alarm handler (flush retry queue) ───────────────────────────────────────

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === ALARM_NAME) {
    processQueue().catch(function (e) {
      console.error('[CodeSync] Queue flush error:', e.message);
    });
  }
});

// ─── Message dispatcher ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'ACCEPTED_SUBMISSION') {
    handleAccepted(msg.payload, sender)
      .then(sendResponse)
      .catch(function (err) {
        console.error('[CodeSync] handleAccepted error:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // keep channel open for async response
  }

  if (msg.type === 'GET_STATS') {
    cs_getStats().then(sendResponse);
    return true;
  }

  if (msg.type === 'GET_LAST_SYNC') {
    cs_getLastSync().then(sendResponse);
    return true;
  }

  if (msg.type === 'GET_QUEUE_SIZE') {
    cs_getQueue().then(function (q) { sendResponse({ size: q.length }); });
    return true;
  }

  if (msg.type === 'FLUSH_QUEUE') {
    processQueue().then(function () { sendResponse({ ok: true }); }).catch(function (e) {
      sendResponse({ ok: false, error: e.message });
    });
    return true;
  }
});

// ─── Main: handle an accepted submission ──────────────────────────────────────

async function handleAccepted(payload, sender) {
  // 1. Check auto-sync setting
  var settings = await cs_getSettings();
  if (!settings.autoSync) return { skipped: true, reason: 'autoSync off' };

  // 2. Validate token + repo
  var token = await cs_getToken();
  var repo  = await cs_getRepo();
  if (!token || !repo) {
    setBadge('!', '#eab308', 8000);
    broadcastToTab(sender, 'SYNC_RESULT', {
      status: 'ERROR',
      problemName: payload.problemName,
      error: !token ? 'No GitHub token — open the extension popup to connect.'
                    : 'No repository selected — open the popup to choose a repo.',
    });
    return { success: false, error: 'not configured' };
  }

  // 3. Dedup: skip if this submission ID was already processed
  var subId = payload.submissionId;
  if (subId) {
    var already = await cs_isProcessed(subId);
    if (already) return { success: true, status: 'SKIPPED', reason: 'already processed' };
  }

  // 4. "Only first solve" check
  if (settings.onlyFirstSolve) {
    var stats = await cs_getStats();
    var alreadySolved = (stats.recentSolves || []).some(function (s) {
      return s.slug === payload.slug;
    });
    if (alreadySolved) {
      broadcastToTab(sender, 'SYNC_RESULT', { status: 'SKIPPED', problemName: payload.problemName });
      return { success: true, status: 'SKIPPED' };
    }
  }

  // 5. Build job
  var langKey  = payload.lang || 'python3';
  var langInfo = cs_getLangInfo(langKey);
  var slug     = payload.slug || 'unknown';
  var name     = payload.problemName || 'Solution';
  var diff     = payload.difficulty  || 'Unknown';

  var job = {
    id:           subId || (slug + '_' + Date.now()),
    slug:         slug,
    problemName:  name,
    difficulty:   diff,
    langKey:      langKey,
    langDisplay:  langInfo.display,
    code:         payload.code || null,
    runtime:      payload.runtime || null,
    memory:       payload.memory  || null,
    problemNumber: payload.problemNumber || null,
    commitReadme: settings.commitReadme,
    retries:      0,
    addedAt:      Date.now(),
  };

  // 6. Try to sync immediately; fall back to queue on failure
  try {
    var result = await commitJob(token, repo, job);

    if (subId) await cs_markProcessed(subId);

    broadcastToTab(sender, 'SYNC_RESULT', {
      status:      'SUCCESS',
      problemName: name,
      commitUrl:   result.commitUrl,
    });
    setBadge('✓', '#22c55e', 6000);
    return { success: true, status: 'SUCCESS', commitUrl: result.commitUrl };

  } catch (err) {
    console.error('[CodeSync] Immediate sync failed, queuing:', err.message);

    // Queue for retry
    await cs_enqueue(job);
    setBadge('⏳', '#6366f1', 10000);
    broadcastToTab(sender, 'SYNC_RESULT', {
      status: 'ERROR',
      problemName: name,
      error: err.message + ' — will retry automatically.',
    });
    return { success: false, queued: true, error: err.message };
  }
}

// ─── Commit a single job to GitHub ───────────────────────────────────────────

async function commitJob(token, repo, job) {
  var owner = repo.owner;
  var name  = repo.name;

  if (!job.code || job.code.trim().length < 2) {
    throw new Error('No code to commit — LeetCode did not return source code in the API response.');
  }

  // ── Solution file ──────────────────────────────────────────────────────────
  var solutionPath = cs_buildSolutionPath(job.difficulty, job.slug, job.langKey);
  var solutionMsg  = cs_buildCommitMessage(job.problemName, job.langKey, false);

  // Try cached SHA first to avoid a GET round-trip
  var solutionSha = await cs_getSha(solutionPath);
  if (!solutionSha) {
    var existing = await gh_getFile(token, owner, name, solutionPath);
    solutionSha = existing.sha;
    solutionMsg = cs_buildCommitMessage(job.problemName, job.langKey, !!solutionSha);
  } else {
    solutionMsg = cs_buildCommitMessage(job.problemName, job.langKey, true);
  }

  var solutionResult = await gh_putFile(token, owner, name, solutionPath, job.code, solutionMsg, solutionSha);
  await cs_updateSha(solutionPath, solutionResult.sha);

  // ── Problem README ──────────────────────────────────────────────────────────
  if (job.commitReadme) {
    var readmePath = cs_buildReadmePath(job.difficulty, job.slug);
    var readmeContent = cs_buildProblemReadme({
      problemName:   job.problemName,
      slug:          job.slug,
      difficulty:    job.difficulty,
      langKey:       job.langKey,
      runtime:       job.runtime,
      memory:        job.memory,
      problemNumber: job.problemNumber,
    });

    var readmeSha = await cs_getSha(readmePath);
    if (!readmeSha) {
      var existingReadme = await gh_getFile(token, owner, name, readmePath);
      readmeSha = existingReadme.sha;
    }

    // Only create README if this is a new file (don't overwrite user notes)
    if (!readmeSha) {
      var readmeResult = await gh_putFile(token, owner, name, readmePath, readmeContent, 'README: ' + job.problemName, null);
      await cs_updateSha(readmePath, readmeResult.sha);
    }
  }

  // ── Stats + root README ─────────────────────────────────────────────────────
  await cs_incrementStats(job.difficulty, {
    slug:        job.slug,
    problemName: job.problemName,
    lang:        job.langDisplay,
    difficulty:  job.difficulty,
    ts:          Date.now(),
    commitUrl:   solutionResult.commitUrl,
  });

  await updateRootReadme(token, owner, name);

  await cs_setLastSync({
    problemName: job.problemName,
    lang:        job.langDisplay,
    difficulty:  job.difficulty,
    status:      'SUCCESS',
    commitUrl:   solutionResult.commitUrl,
  });

  return solutionResult;
}

// ─── Root README updater ──────────────────────────────────────────────────────

async function updateRootReadme(token, owner, repo) {
  try {
    var stats   = await cs_getStats();
    var content = cs_buildRootReadme(stats, stats.recentSolves || []);
    var sha     = await cs_getSha('README.md');
    if (!sha) {
      var existing = await gh_getFile(token, owner, repo, 'README.md');
      sha = existing.sha;
    }
    var result = await gh_putFile(token, owner, repo, 'README.md', content, 'chore: update stats [CodeSync]', sha);
    await cs_updateSha('README.md', result.sha);
  } catch (e) {
    console.warn('[CodeSync] Root README update failed (non-fatal):', e.message);
  }
}

// ─── Queue processor (called by alarm) ───────────────────────────────────────

async function processQueue() {
  var queue = await cs_getQueue();
  if (!queue.length) return;

  var token = await cs_getToken();
  var repo  = await cs_getRepo();
  if (!token || !repo) return;

  for (var i = 0; i < queue.length; i++) {
    var job = queue[i];

    if ((job.retries || 0) >= MAX_RETRIES) {
      console.warn('[CodeSync] Dropping job after max retries:', job.id);
      await cs_dequeue(job.id);
      continue;
    }

    // Exponential backoff check
    var backoffMs = BASE_BACKOFF * Math.pow(2, job.retries || 0);
    if (job.lastAttemptAt && Date.now() - job.lastAttemptAt < backoffMs) continue;

    try {
      await commitJob(token, repo, job);
      await cs_dequeue(job.id);
      if (job.submissionId) await cs_markProcessed(job.submissionId);
      console.log('[CodeSync] Queue job succeeded:', job.problemName);
    } catch (err) {
      console.error('[CodeSync] Queue job failed:', job.id, err.message);
      await cs_updateQueueJob(job.id, {
        retries:       (job.retries || 0) + 1,
        lastAttemptAt: Date.now(),
        lastError:     err.message,
      });
    }
  }
}

// ─── Badge helper ─────────────────────────────────────────────────────────────

function setBadge(text, color, clearAfterMs) {
  chrome.action.setBadgeText({ text: text }).catch(function () {});
  chrome.action.setBadgeBackgroundColor({ color: color }).catch(function () {});
  if (clearAfterMs) {
    setTimeout(function () {
      chrome.action.setBadgeText({ text: '' }).catch(function () {});
    }, clearAfterMs);
  }
}

// ─── Broadcast to the content script tab ──────────────────────────────────────

function broadcastToTab(sender, type, data) {
  if (sender && sender.tab && sender.tab.id) {
    chrome.tabs.sendMessage(sender.tab.id, Object.assign({ type: type }, data)).catch(function () {});
  }
}
