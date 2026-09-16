// ============================================================================
// __tests__/HistorySection.test.jsx — Tests for the Sync History page
//
// Covers:
//   • Loading state while fetching history
//   • Empty state when no history exists
//   • Table renders with correct data (date, repo, status, type, duration)
//   • Delete button removes entry from the table
//   • Refresh button re-fetches history
//   • Stats row shows correct totals
//   • Error state when fetch fails
// ============================================================================

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('../api', () => ({
  apiUrl: (path) => `https://api.example.com${path}`,
}));

const { default: HistorySection } = await import('../components/HistorySection.jsx');

// ── Sample data ───────────────────────────────────────────────────────────────

const HISTORY_ENTRIES = [
  {
    id:           'uuid-1',
    startedAt:    '2024-06-15T10:00:00Z',
    completedAt:  '2024-06-15T10:02:30Z',
    repoUrl:      'https://github.com/user/leetcode.git',
    repoName:     'user/leetcode',
    status:       'success',
    dryRun:       false,
    newCount:     5,
    skippedCount: 2,
  },
  {
    id:           'uuid-2',
    startedAt:    '2024-06-14T09:00:00Z',
    completedAt:  '2024-06-14T09:01:00Z',
    repoUrl:      'https://github.com/user/leetcode.git',
    repoName:     'user/leetcode',
    status:       'error',
    dryRun:       false,
    errorMessage: 'Push failed',
  },
  {
    id:           'uuid-3',
    startedAt:    '2024-06-13T08:00:00Z',
    completedAt:  '2024-06-13T08:00:45Z',
    repoUrl:      'https://github.com/user/leetcode.git',
    repoName:     'user/leetcode',
    status:       'success',
    dryRun:       true,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(entries) {
  global.fetch = jest.fn().mockResolvedValue({
    ok:   true,
    json: async () => entries,
  });
}

function mockFetchError() {
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => jest.clearAllMocks());

describe('HistorySection — loading', () => {
  test('shows a loading indicator while fetching', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));

    render(<HistorySection />);

    expect(screen.getByText(/loading history/i)).toBeInTheDocument();
  });

  test('loading state disappears once data arrives', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      expect(screen.queryByText(/loading history/i)).not.toBeInTheDocument();
    });
  });
});

describe('HistorySection — empty state', () => {
  test('shows empty-state message when history is empty', async () => {
    mockFetch([]);

    render(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText(/no syncs yet/i)).toBeInTheDocument();
    });
  });

  test('empty state includes a helpful hint', async () => {
    mockFetch([]);

    render(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText(/run your first sync/i)).toBeInTheDocument();
    });
  });
});

describe('HistorySection — table rendering', () => {
  test('renders a row for each history entry', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      // All three repo name cells should be present
      const cells = screen.getAllByText('user/leetcode');
      expect(cells.length).toBe(HISTORY_ENTRIES.length);
    });
  });

  test('shows ✓ Success for successful entries', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      const successBadges = screen.getAllByText(/success/i);
      // 2 of 3 entries are success
      expect(successBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('shows ✕ Failed for error entries', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
    });
  });

  test('shows 🔍 Dry Run label for dry-run entries', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText(/dry run/i)).toBeInTheDocument();
    });
  });

  test('table has correct column headers', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Repository')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
    });
  });

  test('does not show "no syncs" message when entries exist', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => screen.getAllByText('user/leetcode'));

    expect(screen.queryByText(/no syncs yet/i)).not.toBeInTheDocument();
  });
});

describe('HistorySection — stats row', () => {
  test('shows correct total sync count', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      // 3 total entries
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  test('shows correct successful sync count', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      // 2 successful entries
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  test('stats row has Total Syncs and Successful labels', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText(/total syncs/i)).toBeInTheDocument();
      expect(screen.getByText(/successful/i)).toBeInTheDocument();
    });
  });
});

describe('HistorySection — delete', () => {
  test('renders a delete button for each entry', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      const deleteBtns = screen.getAllByTitle(/delete/i);
      expect(deleteBtns.length).toBe(HISTORY_ENTRIES.length);
    });
  });

  test('clicking delete removes the entry from the list', async () => {
    mockFetch(HISTORY_ENTRIES);
    // DELETE call for uuid-2 returns success
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => HISTORY_ENTRIES })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(<HistorySection />);

    await waitFor(() => screen.getAllByTitle(/delete/i));

    const deleteBtns = screen.getAllByTitle(/delete/i);
    await userEvent.click(deleteBtns[1]); // delete the second entry (uuid-2, Failed)

    await waitFor(() => {
      const rows = screen.queryAllByText('user/leetcode');
      expect(rows.length).toBe(2); // one entry removed
    });
  });

  test('delete button calls DELETE /api/history/:id', async () => {
    mockFetch(HISTORY_ENTRIES);
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => HISTORY_ENTRIES })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(<HistorySection />);

    await waitFor(() => screen.getAllByTitle(/delete/i));

    await userEvent.click(screen.getAllByTitle(/delete/i)[0]);

    await waitFor(() => {
      const calls = global.fetch.mock.calls;
      const deleteCall = calls.find(c => c[1]?.method === 'DELETE');
      expect(deleteCall).toBeDefined();
      expect(deleteCall[0]).toContain('/api/history/uuid-1');
    });
  });
});

describe('HistorySection — refresh', () => {
  test('renders a Refresh button', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });
  });

  test('clicking Refresh re-fetches the history', async () => {
    mockFetch(HISTORY_ENTRIES);

    render(<HistorySection />);

    await waitFor(() => screen.getByRole('button', { name: /refresh/i }));

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      // fetch called at least twice (initial + refresh)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('HistorySection — fetch failure', () => {
  test('shows empty table (not crash) when API fails', async () => {
    mockFetchError();

    render(<HistorySection />);

    await waitFor(() => {
      expect(screen.getByText(/no syncs yet/i)).toBeInTheDocument();
    });
  });
});
