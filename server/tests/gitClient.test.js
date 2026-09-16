// ============================================================================
// tests/gitClient.test.js — Unit tests for gitClient.js
//
// execSync and all fs write operations are mocked so no real git commands
// or disk writes ever happen. We verify that the right shell commands are
// built with the right arguments and the right environment variables.
// ============================================================================

import { jest } from '@jest/globals';
import path from 'path';

// ── Mock child_process and fs BEFORE importing gitClient ─────────────────────

const mockExecSync = jest.fn();
const mockExistsSync    = jest.fn();
const mockRmSync        = jest.fn();
const mockMkdirSync     = jest.fn();
const mockWriteFileSync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

jest.unstable_mockModule('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync:    mockExistsSync,
    rmSync:        mockRmSync,
    mkdirSync:     mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    // ESM default interop: CJS modules need a 'default' key when mocked
    default: {
      ...actual,
      existsSync:    mockExistsSync,
      rmSync:        mockRmSync,
      mkdirSync:     mockMkdirSync,
      writeFileSync: mockWriteFileSync,
    },
  };
});

const gitClient = await import('../src/git/gitClient.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastCallArgs(mockFn) {
  return mockFn.mock.calls[mockFn.mock.calls.length - 1];
}

function allCommandsCalled() {
  return mockExecSync.mock.calls.map(c => c[0]);
}

// ── getRepoPath() ─────────────────────────────────────────────────────────────

describe('getRepoPath()', () => {
  test('returns an absolute path ending with codesync_repo', () => {
    const p = gitClient.getRepoPath();
    expect(path.isAbsolute(p)).toBe(true);
    expect(p).toMatch(/codesync_repo$/);
  });

  test('is deterministic across calls', () => {
    expect(gitClient.getRepoPath()).toBe(gitClient.getRepoPath());
  });
});

// ── buildAuthUrl (via init behaviour) ────────────────────────────────────────

describe('buildAuthUrl (tested via init)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);   // no leftover repo
    mockExecSync.mockReturnValue(Buffer.from(''));
  });

  test('embeds token into HTTPS URL', () => {
    gitClient.init('https://github.com/user/repo.git', 'ghp_token123');
    const cloneCall = mockExecSync.mock.calls[0][0];
    expect(cloneCall).toContain('ghp_token123@github.com');
  });

  test('does NOT embed token into SSH URL', () => {
    gitClient.init('git@github.com:user/repo.git', 'ghp_token123');
    const cloneCall = mockExecSync.mock.calls[0][0];
    expect(cloneCall).not.toContain('ghp_token123');
    expect(cloneCall).toContain('git@github.com');
  });

  test('leaves HTTPS URL unchanged when no token', () => {
    gitClient.init('https://github.com/user/repo.git', null);
    const cloneCall = mockExecSync.mock.calls[0][0];
    expect(cloneCall).toContain('https://github.com/user/repo.git');
    expect(cloneCall).not.toContain('@github.com');
  });

  test('does not double-embed token if URL already has credentials', () => {
    gitClient.init('https://existing@github.com/user/repo.git', 'ghp_new');
    const cloneCall = mockExecSync.mock.calls[0][0];
    // Should use the new token, not stack them
    expect((cloneCall.match(/ghp_new/g) || []).length).toBe(1);
  });
});

// ── init() ───────────────────────────────────────────────────────────────────

describe('init()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue(Buffer.from(''));
  });

  test('removes leftover repo folder if it exists', () => {
    mockExistsSync.mockReturnValue(true);
    gitClient.init('https://github.com/user/repo.git');
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining('codesync_repo'),
      expect.objectContaining({ recursive: true, force: true })
    );
  });

  test('does NOT call rmSync if no leftover folder', () => {
    mockExistsSync.mockReturnValue(false);
    gitClient.init('https://github.com/user/repo.git');
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  test('calls git clone with the repo URL', () => {
    gitClient.init('https://github.com/user/repo.git');
    const commands = allCommandsCalled();
    expect(commands.some(c => c.startsWith('git clone'))).toBe(true);
  });

  test('configures git user.email after clone', () => {
    gitClient.init('https://github.com/user/repo.git');
    const commands = allCommandsCalled();
    expect(commands.some(c => c.includes('user.email'))).toBe(true);
    expect(commands.some(c => c.includes('codesync@local.dev'))).toBe(true);
  });

  test('configures git user.name after clone', () => {
    gitClient.init('https://github.com/user/repo.git');
    const commands = allCommandsCalled();
    expect(commands.some(c => c.includes('user.name') && c.includes('CodeSync'))).toBe(true);
  });

  test('sets remote URL when token and HTTPS URL are provided', () => {
    gitClient.init('https://github.com/user/repo.git', 'ghp_tok');
    const commands = allCommandsCalled();
    expect(commands.some(c => c.includes('remote set-url origin'))).toBe(true);
  });

  test('does NOT set remote URL for SSH URLs even with a token', () => {
    gitClient.init('git@github.com:user/repo.git', 'ghp_tok');
    const commands = allCommandsCalled();
    expect(commands.some(c => c.includes('remote set-url'))).toBe(false);
  });
});

// ── commit() ─────────────────────────────────────────────────────────────────

describe('commit()', () => {
  const REPO_PATH = gitClient.getRepoPath();

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true); // folder exists already
    mockExecSync.mockReturnValue(Buffer.from(''));
  });

  test('writes the code to the correct file path', () => {
    gitClient.commit('1 Two Sum', '1-two-sum.py', 'code here', 'Add: 1. Two Sum', '2024-01-01T00:00:00Z');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('1 Two Sum'),
      'code here',
      'utf-8'
    );
    const [filePath] = lastCallArgs(mockWriteFileSync);
    expect(filePath).toContain('1-two-sum.py');
  });

  test('creates folder if it does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    gitClient.commit('42 New Problem', '42-new-problem.js', '// code', 'Add: 42. New Problem', '2024-01-01T00:00:00Z');
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('42 New Problem'),
      expect.objectContaining({ recursive: true })
    );
  });

  test('does NOT create folder if it already exists', () => {
    mockExistsSync.mockReturnValue(true);
    gitClient.commit('1 Two Sum', '1-two-sum.py', 'code', 'msg', '2024-01-01T00:00:00Z');
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });

  test('runs git add . before committing', () => {
    gitClient.commit('1 Two Sum', '1-two-sum.py', 'code', 'msg', '2024-01-01T00:00:00Z');
    const commands = allCommandsCalled();
    expect(commands.some(c => c === 'git add .')).toBe(true);
  });

  test('passes custom --date to git commit', () => {
    gitClient.commit('1 Two Sum', '1-two-sum.py', 'code', 'Add: 1. Two Sum', '2024-06-15T12:00:00Z');
    const commands = allCommandsCalled();
    const commitCmd = commands.find(c => c.includes('git commit'));
    expect(commitCmd).toContain('--date=');
    expect(commitCmd).toContain('2024-06-15');
  });

  test('sets GIT_COMMITTER_DATE env var on the commit call', () => {
    gitClient.commit('1 Two Sum', '1-two-sum.py', 'code', 'msg', '2024-06-15T12:00:00Z');
    const commitCall = mockExecSync.mock.calls.find(c => c[0].includes('git commit'));
    const env = commitCall[1].env;
    expect(env.GIT_COMMITTER_DATE).toContain('2024-06-15');
  });

  test('uses --allow-empty flag', () => {
    gitClient.commit('1 Two Sum', '1-two-sum.py', 'code', 'msg', '2024-01-01T00:00:00Z');
    const commands = allCommandsCalled();
    const commitCmd = commands.find(c => c.includes('git commit'));
    expect(commitCmd).toContain('--allow-empty');
  });

  test('includes the commit message in the command', () => {
    gitClient.commit('1 Two Sum', '1-two-sum.py', 'code', 'Add: 1. Two Sum', '2024-01-01T00:00:00Z');
    const commands = allCommandsCalled();
    const commitCmd = commands.find(c => c.includes('git commit'));
    expect(commitCmd).toContain('Add: 1. Two Sum');
  });
});

// ── push() ───────────────────────────────────────────────────────────────────

describe('push()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockExecSync.mockReturnValue(Buffer.from(''));
  });

  test('calls git push', () => {
    gitClient.push();
    const commands = allCommandsCalled();
    expect(commands.some(c => c === 'git push')).toBe(true);
  });

  test('cleans up the repo folder after pushing', () => {
    gitClient.push();
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining('codesync_repo'),
      expect.objectContaining({ recursive: true, force: true })
    );
  });

  test('cleans up AFTER pushing, not before', () => {
    const order = [];
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'git push') order.push('push');
      return Buffer.from('');
    });
    mockRmSync.mockImplementation(() => order.push('cleanup'));

    gitClient.push();
    expect(order.indexOf('push')).toBeLessThan(order.indexOf('cleanup'));
  });

  test('throws if git push fails', () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'git push') throw new Error('remote: Permission denied');
      return Buffer.from('');
    });
    expect(() => gitClient.push()).toThrow('remote: Permission denied');
  });
});

// ── commitReadme() ────────────────────────────────────────────────────────────

describe('commitReadme()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecSync.mockReturnValue(Buffer.from(''));
  });

  test('writes README.md to the repo root', () => {
    gitClient.commitReadme('# My README');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/README\.md$/),
      '# My README',
      'utf-8'
    );
  });

  test('stages README.md with git add', () => {
    gitClient.commitReadme('# README');
    const commands = allCommandsCalled();
    expect(commands.some(c => c === 'git add README.md')).toBe(true);
  });

  test('commits with auto-generated message', () => {
    gitClient.commitReadme('# README');
    const commands = allCommandsCalled();
    expect(commands.some(c => c.includes('Update README'))).toBe(true);
  });

  test('does NOT throw if nothing to commit (git exits 1)', () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd.includes('git commit')) {
        const err = new Error('nothing to commit');
        throw err;
      }
      return Buffer.from('');
    });
    expect(() => gitClient.commitReadme('# README')).not.toThrow();
  });

  test('DOES throw if git commit fails for a different reason', () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd.includes('git commit')) throw new Error('disk full');
      return Buffer.from('');
    });
    expect(() => gitClient.commitReadme('# README')).toThrow('disk full');
  });
});
