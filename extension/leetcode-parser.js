// ─── CodeSync LeetCode Parser ─────────────────────────────────────────────────
// Pure utility module: language maps, file path builders, README generators.
// Loaded by manifest content_scripts (available in content.js) AND
// importScripts in background.js.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Language → { ext, display } map ─────────────────────────────────────────

var CS_LANG = {
  python:       { ext: 'py',    display: 'Python' },
  python3:      { ext: 'py',    display: 'Python 3' },
  cpp:          { ext: 'cpp',   display: 'C++' },
  c:            { ext: 'c',     display: 'C' },
  java:         { ext: 'java',  display: 'Java' },
  csharp:       { ext: 'cs',    display: 'C#' },
  javascript:   { ext: 'js',    display: 'JavaScript' },
  typescript:   { ext: 'ts',    display: 'TypeScript' },
  go:           { ext: 'go',    display: 'Go' },
  golang:       { ext: 'go',    display: 'Go' },
  ruby:         { ext: 'rb',    display: 'Ruby' },
  swift:        { ext: 'swift', display: 'Swift' },
  kotlin:       { ext: 'kt',    display: 'Kotlin' },
  scala:        { ext: 'scala', display: 'Scala' },
  rust:         { ext: 'rs',    display: 'Rust' },
  php:          { ext: 'php',   display: 'PHP' },
  dart:         { ext: 'dart',  display: 'Dart' },
  racket:       { ext: 'rkt',   display: 'Racket' },
  erlang:       { ext: 'erl',   display: 'Erlang' },
  elixir:       { ext: 'ex',    display: 'Elixir' },
  mysql:        { ext: 'sql',   display: 'MySQL' },
  mssql:        { ext: 'sql',   display: 'MS SQL Server' },
  oraclesql:    { ext: 'sql',   display: 'Oracle SQL' },
  bash:         { ext: 'sh',    display: 'Bash' },
  pandas:       { ext: 'py',    display: 'Pandas' },
};

function cs_getLangInfo(langKey) {
  var k = (langKey || '').toLowerCase().trim();
  return CS_LANG[k] || { ext: 'txt', display: langKey || 'Unknown' };
}

// ─── Path builders ────────────────────────────────────────────────────────────

function cs_sanitizePath(str) {
  return (str || '')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')  // invalid FS chars
    .replace(/\s+/g, ' ')          // normalise spaces
    .trim();
}

function cs_buildSolutionPath(difficulty, slug, langKey) {
  var info = cs_getLangInfo(langKey);
  var d = cs_capitalize(difficulty || 'Unknown');
  return d + '/' + (slug || 'unknown') + '/solution.' + info.ext;
}

function cs_buildReadmePath(difficulty, slug) {
  var d = cs_capitalize(difficulty || 'Unknown');
  return d + '/' + (slug || 'unknown') + '/README.md';
}

function cs_capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─── Commit message ───────────────────────────────────────────────────────────

function cs_buildCommitMessage(problemName, langKey, isUpdate) {
  var info = cs_getLangInfo(langKey);
  var action = isUpdate ? 'Update' : 'Add';
  return action + ': ' + (problemName || 'Solution') + ' [' + info.display + ']';
}

// ─── Per-problem README ───────────────────────────────────────────────────────

function cs_buildProblemReadme(opts) {
  var info  = cs_getLangInfo(opts.langKey);
  var num   = opts.problemNumber ? opts.problemNumber + '. ' : '';
  var lines = [
    '# ' + num + (opts.problemName || 'Solution'),
    '',
    '| Field | Value |',
    '|---|---|',
    '| **Difficulty** | ' + (opts.difficulty || 'Unknown') + ' |',
    '| **Language** | ' + info.display + ' |',
  ];
  if (opts.runtime) lines.push('| **Runtime** | ' + opts.runtime + ' |');
  if (opts.memory)  lines.push('| **Memory** | ' + opts.memory + ' |');
  lines.push('| **Problem** | [' + (opts.slug || '') + '](https://leetcode.com/problems/' + (opts.slug || '') + '/) |');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('_Add your notes here_');
  lines.push('');
  return lines.join('\n');
}

// ─── Root repository README ───────────────────────────────────────────────────

function cs_buildRootReadme(stats, recentSolves) {
  var date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  var lines = [
    '# 📚 LeetCode Solutions',
    '',
    '> Automatically synced by **[CodeSync](https://github.com/keshrirohan/Code_Sync)**',
    '',
    '## 📊 Stats',
    '',
    '| 🏆 Total | 🟢 Easy | 🟡 Medium | 🔴 Hard |',
    '|:---:|:---:|:---:|:---:|',
    '| **' + (stats.solved || 0) + '** | ' + (stats.easy || 0) + ' | ' + (stats.medium || 0) + ' | ' + (stats.hard || 0) + ' |',
    '',
    '_Last updated: ' + date + '_',
    '',
  ];

  var solves = recentSolves || [];
  if (solves.length > 0) {
    lines.push('## 🕒 Recent Solves');
    lines.push('');
    lines.push('| Problem | Difficulty | Language | Date |');
    lines.push('|---|---|---|---|');
    solves.slice(0, 10).forEach(function(s) {
      var d = s.ts ? new Date(s.ts).toLocaleDateString('en-US') : '';
      lines.push('| ' + (s.problemName || '') + ' | ' + (s.difficulty || '') + ' | ' + (s.lang || '') + ' | ' + d + ' |');
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Synced with [CodeSync](https://github.com/keshrirohan/Code_Sync)*');
  lines.push('');
  return lines.join('\n');
}

// ─── Parse REST /check/ response ─────────────────────────────────────────────
// LeetCode REST: GET /submissions/detail/{id}/check/
// Returns: { state, status_msg, lang, code, runtime, memory, ... }

function cs_parseRestResponse(data, contextSlug) {
  if (!data || typeof data !== 'object') return null;
  // Only process final states, ignore PENDING/STARTED
  if (data.state !== 'SUCCESS' && data.state !== 'FAILED') return null;
  if (data.status_msg !== 'Accepted') return null;
  return {
    source:       'rest_check',
    lang:         data.lang   || null,
    code:         data.code   || null,
    runtime:      data.runtime || null,
    memory:       data.memory  || null,
    slug:         contextSlug  || null,
    submissionId: data.submission_id ? String(data.submission_id) : null,
  };
}

// ─── Parse GraphQL submissionDetails response ─────────────────────────────────
// LeetCode GraphQL: query submissionDetails { submissionDetails(submissionId: $id) { ... } }

function cs_parseGraphQLResponse(data) {
  if (!data || typeof data !== 'object') return null;
  var sd = (data.data && (data.data.submissionDetails || data.data.submissionDetail)) || null;
  if (!sd) return null;
  // statusCode 10 = Accepted in LeetCode's internal enum
  if (sd.statusCode !== 10 && sd.statusDisplay !== 'Accepted') return null;
  return {
    source:        'graphql',
    lang:          (sd.lang && sd.lang.name) || sd.lang || null,
    langVerbose:   (sd.lang && sd.lang.verboseName) || null,
    code:          sd.code           || null,
    runtime:       sd.runtime        || null,
    memory:        sd.memory         || null,
    slug:          (sd.question && sd.question.titleSlug)            || null,
    problemName:   (sd.question && sd.question.title)                || null,
    difficulty:    (sd.question && sd.question.difficulty)           || null,
    problemNumber: (sd.question && sd.question.questionFrontendId)   || null,
    submissionId:  sd.id ? String(sd.id) : null,
  };
}
