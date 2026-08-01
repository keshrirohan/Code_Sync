// ============================================================================
// readmeGenerator.js — Builds a beautiful README.md for the solutions repo.
//
// Called after every sync (full or incremental). Scans the committed
// folder structure and produces a full markdown table of all problems.
//
// Folder naming convention:  "1 Two Sum/"
//   └── "1-two-sum.cpp"
//
// The generator parses folder names → question # + title,
// then maps the extension back to the display language name.
// ============================================================================

import fs   from 'fs';
import path from 'path';

// ── Language display names (from file extension) ─────────────────────────────

const EXT_TO_LANG = {
  cpp:   'C++',    py:    'Python', java:  'Java',
  js:    'JavaScript', ts: 'TypeScript', go: 'Go',
  rs:    'Rust',   c:    'C',      cs:   'C#',
  rb:    'Ruby',   kt:   'Kotlin', swift: 'Swift',
  dart:  'Dart',   php:  'PHP',    scala: 'Scala',
  rkt:   'Racket', erl:  'Erlang', ex:   'Elixir',
  sh:    'Bash',   sql:  'SQL',    txt:  'Text',
};

const LANG_BADGE = {
  'C++':        '![C++](https://img.shields.io/badge/C++-00599C?style=flat&logo=c%2B%2B&logoColor=white)',
  'Python':     '![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)',
  'Java':       '![Java](https://img.shields.io/badge/Java-ED8B00?style=flat&logo=openjdk&logoColor=white)',
  'JavaScript': '![JS](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)',
  'TypeScript': '![TS](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)',
  'Go':         '![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)',
  'Rust':       '![Rust](https://img.shields.io/badge/Rust-000000?style=flat&logo=rust&logoColor=white)',
  'C':          '![C](https://img.shields.io/badge/C-A8B9CC?style=flat&logo=c&logoColor=black)',
  'C#':         '![C#](https://img.shields.io/badge/C%23-239120?style=flat&logo=csharp&logoColor=white)',
  'Kotlin':     '![Kotlin](https://img.shields.io/badge/Kotlin-7F52FF?style=flat&logo=kotlin&logoColor=white)',
  'Swift':      '![Swift](https://img.shields.io/badge/Swift-F05138?style=flat&logo=swift&logoColor=white)',
};

function langBadge(lang) {
  return LANG_BADGE[lang] || `\`${lang}\``;
}

// ── Scan repo and build problem list ─────────────────────────────────────────

/**
 * scanRepo — Reads the cloned repo directory and returns an array of problem
 *            entries by parsing folder names and finding solution files.
 *
 * Input:  repoPath (string) — absolute path to the local repo clone
 * Output: Array of { id, title, titleSlug, lang, folderName, fileName }
 */
export function scanRepo(repoPath) {
  const entries = [];

  let items;
  try {
    items = fs.readdirSync(repoPath);
  } catch {
    return entries;
  }

  for (const item of items) {
    if (item.startsWith('.') || item === 'README.md') continue;

    const fullPath = path.join(repoPath, item);
    try {
      if (!fs.statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }

    // Parse "1 Two Sum" → id=1, title="Two Sum"
    const match = item.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const id    = match[1];
    const title = match[2];

    // Find the solution file inside the folder
    let files;
    try {
      files = fs.readdirSync(fullPath).filter(f => !f.startsWith('.'));
    } catch {
      continue;
    }
    if (files.length === 0) continue;

    const fileName = files[0];
    const ext      = path.extname(fileName).slice(1).toLowerCase();
    const lang     = EXT_TO_LANG[ext] || ext;

    // Reconstruct the titleSlug from the file name
    // e.g. "1-two-sum.cpp" → "two-sum"
    const titleSlug = fileName.replace(/^\d+-/, '').replace(/\.[^.]+$/, '');

    entries.push({ id, title, titleSlug, lang, folderName: item, fileName });
  }

  // Sort numerically by question ID
  entries.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
  return entries;
}

// ── README markdown builder ───────────────────────────────────────────────────

/**
 * generateReadme — Builds the full README.md content.
 *
 * Input:  entries — result from scanRepo()
 *         githubRepoUrl — the https:// URL of the GitHub repo (no .git)
 * Output: README.md content as a string
 */
export function generateReadme(entries, githubRepoUrl) {
  const total = entries.length;

  // Unique languages used
  const langs     = [...new Set(entries.map(e => e.lang))];
  const langsList = langs.join(' · ');

  // Count by difficulty (we don't fetch difficulty, so bucket by language)
  // We'll just show language distribution instead
  const langCounts = {};
  for (const e of entries) {
    langCounts[e.lang] = (langCounts[e.lang] || 0) + 1;
  }

  const langStatsRows = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `| ${langBadge(l)} | ${n} |`)
    .join('\n');

  // Build the problem table rows
  const tableRows = entries.map((e, i) => {
    const lcUrl      = `https://leetcode.com/problems/${e.titleSlug}/`;
    // URL-encode the folder name for the GitHub link
    const folderEnc  = encodeURIComponent(e.folderName);
    const fileEnc    = encodeURIComponent(e.fileName);
    const solutionUrl = githubRepoUrl
      ? `${githubRepoUrl}/blob/main/${folderEnc}/${fileEnc}`
      : `#`;
    return `| ${i + 1} | **${e.id}** | [${e.title}](${lcUrl}) | ${langBadge(e.lang)} | [📄 View](${solutionUrl}) |`;
  }).join('\n');

  const updatedAt = new Date().toUTCString();

  return `<div align="center">

# 🚀 LeetCode Solutions

<p>
  Automatically synced using <a href="https://github.com/keshrirohan/Code_Sync"><strong>CodeSync</strong></a>
</p>

[![Problems Solved](https://img.shields.io/badge/Problems%20Solved-${total}-4ade80?style=for-the-badge&logo=leetcode&logoColor=white)](${githubRepoUrl || '#'})
[![Auto Sync](https://img.shields.io/badge/Auto%20Sync-Enabled-7c3aed?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/keshrirohan/Code_Sync)

</div>

---

## 📊 Language Distribution

| Language | Solutions |
|----------|-----------|
${langStatsRows}

---

## 📋 All Solutions (${total})

| S.No | # | Problem | Language | Solution |
|------|---|---------|----------|----------|
${tableRows}

---

<div align="center">
  <sub>
    🔄 Last updated: <strong>${updatedAt}</strong><br/>
    Auto-synced by <a href="https://github.com/keshrirohan/Code_Sync">CodeSync</a>
  </sub>
</div>
`;
}
