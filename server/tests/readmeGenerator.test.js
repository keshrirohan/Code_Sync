// ============================================================================
// tests/readmeGenerator.test.js — Unit tests for scanRepo() and generateReadme()
//
// scanRepo() reads from the filesystem, so we mock fs.readdirSync and
// fs.statSync to avoid touching disk.
// generateReadme() is pure (string in → string out), so no mocking needed.
// ============================================================================

import { jest } from '@jest/globals';

// ── Mock the fs module before importing the generator ────────────────────────

const mockReaddirSync = jest.fn();
const mockStatSync    = jest.fn();

jest.unstable_mockModule('fs', () => {
  const actual = jest.requireActual('fs');
  const mocked = {
    ...actual,
    readdirSync: mockReaddirSync,
    statSync:    mockStatSync,
  };
  return { ...mocked, default: mocked };
});

const fs = await import('fs');
const { scanRepo, generateReadme } = await import('../src/sync/readmeGenerator.js');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a fake repo directory on disk:
 * readdirSync('/repo')         → ['1 Two Sum', '2 Add Two Numbers', 'README.md']
 * statSync('/repo/1 Two Sum')  → { isDirectory: () => true }
 * readdirSync('/repo/1 Two Sum') → ['1-two-sum.py']
 */
function setupFakeRepo(problems) {
  // top-level items
  const topLevel = [...problems.map(p => p.folder), 'README.md', '.git'];

  fs.readdirSync.mockImplementation((dirPath) => {
    if (dirPath === '/fake-repo') return topLevel;
    // Find the matching problem folder
    const prob = problems.find(p => dirPath.endsWith(p.folder));
    if (prob) return prob.files;
    return [];
  });

  fs.statSync.mockImplementation((itemPath) => {
    const isDir = problems.some(p => itemPath.endsWith(p.folder));
    return { isDirectory: () => isDir };
  });
}

// ── scanRepo() tests ──────────────────────────────────────────────────────────

describe('scanRepo()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns empty array when readdirSync throws', () => {
    fs.readdirSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(scanRepo('/nonexistent')).toEqual([]);
  });

  test('returns empty array for empty repo', () => {
    fs.readdirSync.mockReturnValue([]);
    expect(scanRepo('/fake-repo')).toEqual([]);
  });

  test('skips README.md and dotfiles', () => {
    fs.readdirSync.mockReturnValue(['README.md', '.git', '.gitignore']);
    fs.statSync.mockReturnValue({ isDirectory: () => false });
    expect(scanRepo('/fake-repo')).toEqual([]);
  });

  test('skips non-directory items', () => {
    fs.readdirSync.mockReturnValue(['some-file.txt', '1 Two Sum']);
    fs.statSync.mockImplementation((p) => ({
      isDirectory: () => p.endsWith('1 Two Sum'),
    }));
    fs.readdirSync.mockImplementation((p) => {
      if (p === '/fake-repo') return ['some-file.txt', '1 Two Sum'];
      return ['1-two-sum.py'];
    });
    const entries = scanRepo('/fake-repo');
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Two Sum');
  });

  test('parses a single problem folder correctly', () => {
    setupFakeRepo([{ folder: '1 Two Sum', files: ['1-two-sum.py'] }]);
    const entries = scanRepo('/fake-repo');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id:        '1',
      title:     'Two Sum',
      titleSlug: 'two-sum',
      lang:      'Python',
      folderName: '1 Two Sum',
      fileName:  '1-two-sum.py',
    });
  });

  test('parses multiple problems and sorts by numeric id', () => {
    setupFakeRepo([
      { folder: '21 Merge Two Sorted Lists', files: ['21-merge-two-sorted-lists.java'] },
      { folder: '1 Two Sum',                 files: ['1-two-sum.cpp'] },
      { folder: '4 Median Of Two Sorted',    files: ['4-median-of-two-sorted-arrays.go'] },
    ]);
    const entries = scanRepo('/fake-repo');
    expect(entries.map(e => e.id)).toEqual(['1', '4', '21']);
  });

  test('maps all known extensions to display language names', () => {
    const cases = [
      { folder: '1 A', files: ['1-a.py'],   lang: 'Python'     },
      { folder: '2 B', files: ['2-b.cpp'],  lang: 'C++'        },
      { folder: '3 C', files: ['3-c.java'], lang: 'Java'       },
      { folder: '4 D', files: ['4-d.js'],   lang: 'JavaScript' },
      { folder: '5 E', files: ['5-e.ts'],   lang: 'TypeScript' },
      { folder: '6 F', files: ['6-f.go'],   lang: 'Go'         },
      { folder: '7 G', files: ['7-g.rs'],   lang: 'Rust'       },
      { folder: '8 H', files: ['8-h.cs'],   lang: 'C#'         },
    ];
    setupFakeRepo(cases);
    const entries = scanRepo('/fake-repo');
    cases.forEach((c, i) => {
      expect(entries[i].lang).toBe(c.lang);
    });
  });

  test('falls back to extension string for unknown language', () => {
    setupFakeRepo([{ folder: '1 Mystery', files: ['1-mystery.xyz'] }]);
    const entries = scanRepo('/fake-repo');
    expect(entries[0].lang).toBe('xyz');
  });

  test('skips folders with no files inside', () => {
    fs.readdirSync.mockImplementation((p) => {
      if (p === '/fake-repo') return ['1 Empty'];
      return []; // empty problem folder
    });
    fs.statSync.mockReturnValue({ isDirectory: () => true });
    expect(scanRepo('/fake-repo')).toEqual([]);
  });

  test('ignores dotfiles inside problem folders', () => {
    setupFakeRepo([{ folder: '1 Two Sum', files: ['.DS_Store', '1-two-sum.py'] }]);
    // Override: make readdirSync return dotfile + solution
    fs.readdirSync.mockImplementation((p) => {
      if (p === '/fake-repo') return ['1 Two Sum'];
      return ['.DS_Store', '1-two-sum.py'];
    });
    const entries = scanRepo('/fake-repo');
    // .DS_Store filtered because files[0] after filter is '1-two-sum.py'
    expect(entries).toHaveLength(1);
    expect(entries[0].fileName).toBe('1-two-sum.py');
  });
});

// ── generateReadme() tests ────────────────────────────────────────────────────

describe('generateReadme()', () => {
  const SAMPLE_ENTRIES = [
    { id: '1',  title: 'Two Sum',          titleSlug: 'two-sum',          lang: 'Python',     folderName: '1 Two Sum',          fileName: '1-two-sum.py'   },
    { id: '2',  title: 'Add Two Numbers',  titleSlug: 'add-two-numbers',  lang: 'JavaScript', folderName: '2 Add Two Numbers',  fileName: '2-add-two-numbers.js' },
    { id: '3',  title: 'Longest Substring',titleSlug: 'longest-substring',lang: 'C++',        folderName: '3 Longest Substring',fileName: '3-longest-substring.cpp' },
  ];

  test('contains the total problem count', () => {
    const md = generateReadme(SAMPLE_ENTRIES, 'https://github.com/user/repo');
    expect(md).toContain('3');
  });

  test('contains all problem titles', () => {
    const md = generateReadme(SAMPLE_ENTRIES, 'https://github.com/user/repo');
    expect(md).toContain('Two Sum');
    expect(md).toContain('Add Two Numbers');
    expect(md).toContain('Longest Substring');
  });

  test('contains LeetCode problem links', () => {
    const md = generateReadme(SAMPLE_ENTRIES, 'https://github.com/user/repo');
    expect(md).toContain('https://leetcode.com/problems/two-sum/');
    expect(md).toContain('https://leetcode.com/problems/add-two-numbers/');
  });

  test('contains GitHub solution links', () => {
    const repoUrl = 'https://github.com/user/repo';
    const md = generateReadme(SAMPLE_ENTRIES, repoUrl);
    expect(md).toContain(repoUrl + '/blob/main/');
  });

  test('contains language distribution section', () => {
    const md = generateReadme(SAMPLE_ENTRIES, 'https://github.com/user/repo');
    expect(md).toContain('Language Distribution');
    expect(md).toContain('Python');
    expect(md).toContain('JavaScript');
    expect(md).toContain('C++');
  });

  test('language badge uses shield.io for known languages', () => {
    const md = generateReadme(SAMPLE_ENTRIES, 'https://github.com/user/repo');
    expect(md).toContain('shields.io');
  });

  test('generates valid markdown table structure', () => {
    const md = generateReadme(SAMPLE_ENTRIES, 'https://github.com/user/repo');
    // Table header row
    expect(md).toContain('| S.No | # | Problem | Language | Solution |');
    // Table separator
    expect(md).toContain('|------|---|---------|----------|----------|');
  });

  test('handles empty entries array without crashing', () => {
    const md = generateReadme([], 'https://github.com/user/repo');
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
    expect(md).toContain('0');
  });

  test('works without a githubRepoUrl (falls back to #)', () => {
    const md = generateReadme(SAMPLE_ENTRIES, '');
    expect(md).not.toContain('undefined');
    // fallback href is '#'
    expect(md).toContain('href="#"');
  });

  test('URL-encodes folder names with spaces in solution links', () => {
    const md = generateReadme(SAMPLE_ENTRIES, 'https://github.com/user/repo');
    // "1 Two Sum" → "1%20Two%20Sum" in the URL
    expect(md).toContain('1%20Two%20Sum');
  });

  test('contains Last Updated timestamp', () => {
    const md = generateReadme(SAMPLE_ENTRIES, 'https://github.com/user/repo');
    expect(md).toContain('Last updated');
  });

  test('numbers table rows sequentially (S.No column)', () => {
    const md = generateReadme(SAMPLE_ENTRIES, 'https://github.com/user/repo');
    expect(md).toContain('| 1 |');
    expect(md).toContain('| 2 |');
    expect(md).toContain('| 3 |');
  });
});
