// ============================================================================
// __tests__/RepoSection.test.jsx — Tests for the Repository selection page
//
// Covers:
//   • Gate: shows warning when GitHub is not connected
//   • Loading state while fetching repos
//   • Repo list renders with name, visibility, description
//   • Search filter narrows the displayed list
//   • Clicking a repo selects it (radio-style)
//   • Save Selection button saves the choice via POST /api/repos/select
//   • Save button is disabled when current repo is already selected
//   • Refresh button re-fetches the list
//   • Error state when fetch fails
// ============================================================================

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('../api', () => ({
  apiUrl: (path) => `https://api.example.com${path}`,
}));

const { default: RepoSection } = await import('../components/RepoSection.jsx');

// ── Sample repos ──────────────────────────────────────────────────────────────

const REPOS = [
  {
    name:        'johndoe/leetcode-solutions',
    url:         'https://github.com/johndoe/leetcode-solutions.git',
    private:     false,
    description: 'My LeetCode solutions',
    updatedAt:   new Date(Date.now() - 86400000).toISOString(), // yesterday
    stars:       12,
  },
  {
    name:        'johndoe/private-repo',
    url:         'https://github.com/johndoe/private-repo.git',
    private:     true,
    description: 'A private repository',
    updatedAt:   new Date(Date.now() - 2 * 86400000).toISOString(),
    stars:       0,
  },
  {
    name:        'johndoe/other-project',
    url:         'https://github.com/johndoe/other-project.git',
    private:     false,
    description: 'Something else',
    updatedAt:   new Date(Date.now() - 3 * 86400000).toISOString(),
    stars:       3,
  },
];

// ── Default config props ──────────────────────────────────────────────────────

const CONFIG_WITH_GITHUB = {
  hasLeetcodeCookie: true,
  hasGithubToken:    true,
  githubUsername:    'johndoe',
  targetRepoUrl:     null,
  targetRepoName:    null,
};

const CONFIG_NO_GITHUB = {
  hasLeetcodeCookie: false,
  hasGithubToken:    false,
  githubUsername:    null,
  targetRepoUrl:     null,
  targetRepoName:    null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockReposFetch(repos = REPOS) {
  global.fetch = jest.fn().mockResolvedValue({
    ok:   true,
    json: async () => repos,
  });
}

function mockReposFetchError() {
  global.fetch = jest.fn().mockResolvedValue({
    ok:   false,
    json: async () => ({ error: 'GitHub not connected' }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => jest.clearAllMocks());

describe('RepoSection — GitHub not connected gate', () => {
  test('shows a warning when GitHub token is missing', () => {
    render(<RepoSection config={CONFIG_NO_GITHUB} onUpdate={jest.fn()} />);

    expect(screen.getByText(/connect your github account first/i)).toBeInTheDocument();
  });

  test('does not fetch repos when GitHub is not connected', () => {
    global.fetch = jest.fn();

    render(<RepoSection config={CONFIG_NO_GITHUB} onUpdate={jest.fn()} />);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('RepoSection — loading', () => {
  test('shows loading indicator while fetching repos', () => {
    global.fetch = jest.fn(() => new Promise(() => {}));

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    expect(screen.getByText(/loading repositories/i)).toBeInTheDocument();
  });

  test('loading disappears once repos arrive', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText(/loading repositories/i)).not.toBeInTheDocument();
    });
  });
});

describe('RepoSection — repo list rendering', () => {
  test('renders all repo names', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('johndoe/leetcode-solutions')).toBeInTheDocument();
      expect(screen.getByText('johndoe/private-repo')).toBeInTheDocument();
      expect(screen.getByText('johndoe/other-project')).toBeInTheDocument();
    });
  });

  test('renders descriptions', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('My LeetCode solutions')).toBeInTheDocument();
    });
  });

  test('shows 🌐 Public badge for public repos', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => {
      const publicBadges = screen.getAllByText(/public/i);
      expect(publicBadges.length).toBeGreaterThan(0);
    });
  });

  test('shows 🔒 Private badge for private repos', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/private/i)).toBeInTheDocument();
    });
  });

  test('shows empty-state when repo list is empty', async () => {
    mockReposFetch([]);

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/no repositories found/i)).toBeInTheDocument();
    });
  });
});

describe('RepoSection — search filter', () => {
  test('renders a search input', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    expect(screen.getByPlaceholderText(/search repositories/i)).toBeInTheDocument();
  });

  test('typing in search narrows the list', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    await userEvent.type(screen.getByPlaceholderText(/search repositories/i), 'leetcode');

    expect(screen.getByText('johndoe/leetcode-solutions')).toBeInTheDocument();
    expect(screen.queryByText('johndoe/private-repo')).not.toBeInTheDocument();
    expect(screen.queryByText('johndoe/other-project')).not.toBeInTheDocument();
  });

  test('search is case-insensitive', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    await userEvent.type(screen.getByPlaceholderText(/search repositories/i), 'LEETCODE');

    expect(screen.getByText('johndoe/leetcode-solutions')).toBeInTheDocument();
  });

  test('empty search shows all repos again', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    const searchInput = screen.getByPlaceholderText(/search repositories/i);
    await userEvent.type(searchInput, 'leetcode');
    await userEvent.clear(searchInput);

    await waitFor(() => {
      expect(screen.getByText('johndoe/private-repo')).toBeInTheDocument();
      expect(screen.getByText('johndoe/other-project')).toBeInTheDocument();
    });
  });

  test('shows "no matching repos" when search has no results', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    await userEvent.type(
      screen.getByPlaceholderText(/search repositories/i),
      'xxxxxxxxxnotexists'
    );

    expect(screen.getByText(/no matching repos/i)).toBeInTheDocument();
  });

  test('searches by description as well as name', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    await userEvent.type(
      screen.getByPlaceholderText(/search repositories/i),
      'Something else'
    );

    expect(screen.getByText('johndoe/other-project')).toBeInTheDocument();
    expect(screen.queryByText('johndoe/leetcode-solutions')).not.toBeInTheDocument();
  });
});

describe('RepoSection — selection & save', () => {
  test('clicking a repo item marks it as selected', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    await userEvent.click(screen.getByText('johndoe/leetcode-solutions'));

    // The selected item gets the "selected" CSS class
    const item = screen.getByText('johndoe/leetcode-solutions').closest('.repo-item');
    expect(item).toHaveClass('selected');
  });

  test('Save Selection button is disabled before selecting a repo', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    const saveBtn = screen.getByRole('button', { name: /save selection/i });
    expect(saveBtn).toBeDisabled();
  });

  test('Save Selection button becomes enabled after selecting a new repo', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    await userEvent.click(screen.getByText('johndoe/leetcode-solutions'));

    const saveBtn = screen.getByRole('button', { name: /save selection/i });
    expect(saveBtn).not.toBeDisabled();
  });

  test('Save Selection calls POST /api/repos/select with correct body', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => REPOS })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    const onUpdate = jest.fn();
    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={onUpdate} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    await userEvent.click(screen.getByText('johndoe/leetcode-solutions'));
    await userEvent.click(screen.getByRole('button', { name: /save selection/i }));

    await waitFor(() => {
      const calls = global.fetch.mock.calls;
      const saveCall = calls.find(c => c[0]?.includes('/api/repos/select'));
      expect(saveCall).toBeDefined();
      const body = JSON.parse(saveCall[1].body);
      expect(body.repoUrl).toBe('https://github.com/johndoe/leetcode-solutions.git');
      expect(body.repoName).toBe('johndoe/leetcode-solutions');
    });
  });

  test('Save Selection calls onUpdate after saving', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => REPOS })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    const onUpdate = jest.fn();
    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={onUpdate} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    await userEvent.click(screen.getByText('johndoe/leetcode-solutions'));
    await userEvent.click(screen.getByRole('button', { name: /save selection/i }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });

  test('Save Selection is disabled when the already-saved repo is selected', async () => {
    mockReposFetch();
    const configWithExistingRepo = {
      ...CONFIG_WITH_GITHUB,
      targetRepoUrl:  'https://github.com/johndoe/leetcode-solutions.git',
      targetRepoName: 'johndoe/leetcode-solutions',
    };

    render(<RepoSection config={configWithExistingRepo} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    // The already-saved repo is pre-selected — clicking it again keeps it selected
    await userEvent.click(screen.getByText('johndoe/leetcode-solutions'));

    const saveBtn = screen.getByRole('button', { name: /save selection/i });
    expect(saveBtn).toBeDisabled();
  });

  test('shows "Repository saved!" confirmation after saving', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => REPOS })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByText('johndoe/leetcode-solutions'));

    await userEvent.click(screen.getByText('johndoe/leetcode-solutions'));
    await userEvent.click(screen.getByRole('button', { name: /save selection/i }));

    await waitFor(() => {
      expect(screen.getByText(/repository saved/i)).toBeInTheDocument();
    });
  });

  test('shows current selection banner when a repo is already saved', async () => {
    mockReposFetch();
    const config = {
      ...CONFIG_WITH_GITHUB,
      targetRepoUrl:  'https://github.com/johndoe/leetcode-solutions.git',
      targetRepoName: 'johndoe/leetcode-solutions',
    };

    render(<RepoSection config={config} onUpdate={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/currently syncing to/i)).toBeInTheDocument();
    });
  });
});

describe('RepoSection — refresh', () => {
  test('renders a Refresh button', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });
  });

  test('clicking Refresh re-fetches repos', async () => {
    mockReposFetch();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => screen.getByRole('button', { name: /refresh/i }));

    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('RepoSection — error state', () => {
  test('shows error message when repo fetch fails', async () => {
    mockReposFetchError();

    render(<RepoSection config={CONFIG_WITH_GITHUB} onUpdate={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/github not connected/i)).toBeInTheDocument();
    });
  });
});
