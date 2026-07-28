// ─── CodeSync Injected Script (Main World) ────────────────────────────────────
// Injected by content.js into the PAGE's JavaScript context via a <script> tag.
// Because content scripts run in an isolated world, patching fetch/XHR there
// does NOT affect LeetCode's own network calls. Running in the page world lets
// our patches intercept LeetCode's actual polling requests.
//
// Strategy:
//   LeetCode polls  GET /submissions/detail/{id}/check/  every ~2 s until the
//   judging finishes (state: PENDING → STARTED → SUCCESS/FAILED).
//   We listen to EVERY response and fire SUBMISSION_ACCEPTED only when the
//   final state arrives with status_msg === "Accepted".
//
//   We also watch for the GraphQL submissionDetails query as a secondary source.
//
// All results are posted to the content script via window.postMessage.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  if (window.__codeSyncV2Injected) return;
  window.__codeSyncV2Injected = true;

  // ─── URL patterns ──────────────────────────────────────────────────────────
  var CHECK_RE   = /\/submissions\/detail\/(\d+)\/check\//;
  var GRAPHQL_RE = /\/graphql\/?$/;

  // ─── postMessage wrapper ───────────────────────────────────────────────────
  function post(type, data) {
    window.postMessage({ __cs2: true, type: type, data: data || {} }, '*');
  }

  // ─── Parse REST /check/ response ──────────────────────────────────────────
  function handleCheck(url, text) {
    var data;
    try { data = JSON.parse(text); } catch (_) { return; }
    if (!data) return;

    var m = url.match(CHECK_RE);
    var subId = m ? m[1] : null;

    // Ignore intermediate polling states
    if (data.state === 'PENDING' || data.state === 'STARTED') return;

    if (data.state === 'SUCCESS' && data.status_msg === 'Accepted') {
      post('SUBMISSION_ACCEPTED', {
        source:       'rest_check',
        submissionId: subId,
        lang:         data.lang        || null,
        code:         data.code        || null,
        runtime:      data.runtime     || null,
        memory:       data.memory      || null,
      });
    }
    // Non-accepted final states (Wrong Answer, TLE, etc.) — just log, don't sync
  }

  // ─── Parse GraphQL response ────────────────────────────────────────────────
  function handleGraphQL(url, text) {
    var data;
    try { data = JSON.parse(text); } catch (_) { return; }
    if (!data || !data.data) return;

    var sd = data.data.submissionDetails || data.data.submissionDetail;
    if (!sd) return;

    // statusCode 10 = Accepted
    if (sd.statusCode !== 10 && sd.statusDisplay !== 'Accepted') return;

    post('SUBMISSION_ACCEPTED', {
      source:        'graphql',
      submissionId:  sd.id ? String(sd.id) : null,
      lang:          (sd.lang && sd.lang.name) || sd.lang || null,
      langVerbose:   (sd.lang && sd.lang.verboseName) || null,
      code:          sd.code    || null,
      runtime:       sd.runtime || null,
      memory:        sd.memory  || null,
      slug:          sd.question && sd.question.titleSlug  || null,
      problemName:   sd.question && sd.question.title      || null,
      difficulty:    sd.question && sd.question.difficulty || null,
      problemNumber: sd.question && sd.question.questionFrontendId || null,
    });
  }

  // ─── Patch XMLHttpRequest ──────────────────────────────────────────────────
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._csUrl = typeof url === 'string' ? url : String(url);
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var self = this;
    var url = self._csUrl || '';
    var isCheck   = CHECK_RE.test(url);
    var isGraphQL = GRAPHQL_RE.test(url);

    if (isCheck || isGraphQL) {
      self.addEventListener('load', function () {
        if (self.status === 200) {
          if (isCheck)   handleCheck(url, self.responseText);
          if (isGraphQL) handleGraphQL(url, self.responseText);
        }
      });
    }
    return origSend.apply(this, arguments);
  };

  // ─── Patch fetch ───────────────────────────────────────────────────────────
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input
            : (input && typeof input.url === 'string') ? input.url
            : String(input);
    var isCheck   = CHECK_RE.test(url);
    var isGraphQL = GRAPHQL_RE.test(url);

    var p = origFetch.apply(this, arguments);

    if (isCheck || isGraphQL) {
      p.then(function (res) {
        if (res.status === 200) {
          res.clone().text().then(function (text) {
            if (isCheck)   handleCheck(url, text);
            if (isGraphQL) handleGraphQL(url, text);
          }).catch(function () {});
        }
      }).catch(function () {});
    }

    return p;
  };

  post('INJECTED_READY', { ts: Date.now() });
})();
