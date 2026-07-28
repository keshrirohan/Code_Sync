// ─── CodeSync GitHub API Module ───────────────────────────────────────────────
// Direct GitHub REST API v3 calls — no OAuth, PAT only.
// Used by background.js via importScripts. Not available in content scripts.
// ─────────────────────────────────────────────────────────────────────────────

var GH_API = 'https://api.github.com';

// ─── UTF-8 safe base64 ────────────────────────────────────────────────────────
// btoa() alone breaks on multi-byte characters (emoji, CJK in code comments).

function gh_toBase64(str) {
  var bytes = new TextEncoder().encode(str);
  var binary = '';
  bytes.forEach(function(b) { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// ─── Sleep helper ─────────────────────────────────────────────────────────────

function gh_sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

// ─── Core fetch with automatic retry + backoff ────────────────────────────────
// Retries on:
//   • Network failures
//   • 403 / 429 (rate limit) — respects X-RateLimit-Reset header
//   • 5xx server errors — exponential backoff

async function gh_request(token, method, path, body, retryCount) {
  retryCount = retryCount || 0;
  var url = path.startsWith('http') ? path : GH_API + path;
  var opts = {
    method: method,
    headers: {
      'Authorization':        'Bearer ' + token,
      'Accept':               'application/vnd.github.v3+json',
      'Content-Type':         'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  var res;
  try {
    res = await fetch(url, opts);
  } catch (networkErr) {
    if (retryCount < 3) {
      await gh_sleep(1000 * Math.pow(2, retryCount));
      return gh_request(token, method, path, body, retryCount + 1);
    }
    throw new Error('Network error: ' + networkErr.message);
  }

  // Rate limit: wait until reset
  if ((res.status === 403 || res.status === 429) && retryCount < 2) {
    var reset = res.headers.get('X-RateLimit-Reset');
    var waitMs = reset ? Math.max(500, Number(reset) * 1000 - Date.now() + 500) : 60000;
    await gh_sleep(Math.min(waitMs, 120000));
    return gh_request(token, method, path, body, retryCount + 1);
  }

  // Server error: exponential backoff
  if (res.status >= 500 && retryCount < 3) {
    await gh_sleep(2000 * Math.pow(2, retryCount));
    return gh_request(token, method, path, body, retryCount + 1);
  }

  var data = {};
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) {
    var msg = data.message || ('HTTP ' + res.status);
    var err = new Error(msg);
    err.status = res.status;
    err.ghData = data;
    throw err;
  }

  return { data: data, status: res.status, headers: res.headers };
}

// ─── Verify token ─────────────────────────────────────────────────────────────

async function gh_getUser(token) {
  var r = await gh_request(token, 'GET', '/user');
  return r.data; // { login, id, avatar_url, name, ... }
}

// ─── List repos (all pages) ───────────────────────────────────────────────────

async function gh_listRepos(token) {
  var all = [];
  var page = 1;
  while (true) {
    var r = await gh_request(token, 'GET', '/user/repos?per_page=100&page=' + page + '&sort=updated&affiliation=owner');
    if (!r.data.length) break;
    all = all.concat(r.data);
    if (r.data.length < 100) break;
    page++;
  }
  return all.map(function(repo) {
    return {
      id:            repo.id,
      name:          repo.name,
      fullName:      repo.full_name,
      private:       repo.private,
      htmlUrl:       repo.html_url,
      defaultBranch: repo.default_branch,
      description:   repo.description,
    };
  });
}

// ─── Get file (returns null if 404) ──────────────────────────────────────────

async function gh_getFile(token, owner, repo, filePath) {
  try {
    var r = await gh_request(token, 'GET', '/repos/' + owner + '/' + repo + '/contents/' + encodeURIComponent(filePath).replace(/%2F/g, '/'));
    return { sha: r.data.sha, content: r.data.content, exists: true };
  } catch (err) {
    if (err.status === 404) return { exists: false, sha: null };
    throw err;
  }
}

// ─── Create or update file ────────────────────────────────────────────────────
// • Pass sha=null to create a new file.
// • On 409 (conflict / sha mismatch), re-fetches the current sha and retries once.

async function gh_putFile(token, owner, repo, filePath, content, message, sha) {
  var body = {
    message: message,
    content: gh_toBase64(content),
  };
  if (sha) body.sha = sha;

  var encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/');

  try {
    var r = await gh_request(token, 'PUT', '/repos/' + owner + '/' + repo + '/contents/' + encodedPath, body);
    return {
      sha:       r.data.content && r.data.content.sha,
      commitUrl: r.data.commit  && r.data.commit.html_url,
      commitSha: r.data.commit  && r.data.commit.sha,
    };
  } catch (err) {
    // 409 = sha mismatch; fetch current sha and retry once
    if (err.status === 409) {
      var current = await gh_getFile(token, owner, repo, filePath);
      if (current.sha) {
        body.sha = current.sha;
        var r2 = await gh_request(token, 'PUT', '/repos/' + owner + '/' + repo + '/contents/' + encodedPath, body);
        return {
          sha:       r2.data.content && r2.data.content.sha,
          commitUrl: r2.data.commit  && r2.data.commit.html_url,
          commitSha: r2.data.commit  && r2.data.commit.sha,
        };
      }
    }
    throw err;
  }
}

// ─── Create a new repository ──────────────────────────────────────────────────

async function gh_createRepo(token, name, isPrivate) {
  var r = await gh_request(token, 'POST', '/user/repos', {
    name:        name,
    private:     !!isPrivate,
    auto_init:   true,
    description: 'LeetCode solutions synced by CodeSync',
  });
  return {
    id:            r.data.id,
    name:          r.data.name,
    fullName:      r.data.full_name,
    private:       r.data.private,
    htmlUrl:       r.data.html_url,
    defaultBranch: r.data.default_branch,
  };
}
