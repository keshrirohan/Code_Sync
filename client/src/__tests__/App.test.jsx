// ============================================================================
// __tests__/App.test.jsx — Tests for the root App component
//
// Covers:
//   • Loading spinner shown while /api/config is in-flight
//   • Backend-offline screen shown on fetch failure
//   • Retry button re-triggers the config fetch
//   • OAuth success redirect (?gh_connected=1) sets page to 'repo' + shows toast
//   • OAuth error redirect (?gh_error=...) shows error toast
//   • Normal boot: renders Sidebar + default Connect page
// ============================================================================

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mock child components so tests focus on App orchestration logic ───────────

jest.mock('../components/Sidebar',        () => () => <nav data-testid="sidebar" />);
jest.mock('../components/ConnectSection', () => () => <div data-testid="connect-section" />);
jest.mock('../components/RepoSection',    () => () => <div data-testid="repo-section" />);
jest.mock('../components/SyncSection',    () => () => <div data-testid="sync-section" />);
jest.mock('../components/HistorySection', () => () => <div data-testid="history-section" />);

// ── Mock the api helper so fetch calls use our base URL ───────────────────────

jest.mock('../api', () => ({
  apiUrl: (path) => `https://api.example.com${path}`,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchSuccess(data = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  });
}

function mockFetchFailure() {
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
}

function setSearchParams(params) {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, search: params, href: `http://localhost/${params}` },
  });
}

// Import App AFTER mocks are set up
const { default: App } = await import('../App.jsx');

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset URL search params
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { search: '', pathname: '/', href: 'http://localhost/' },
  });
  window.history.replaceState = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('App — loading state', () => {
  test('shows loading spinner while fetching config', async () => {
    // Never resolve so we stay in loading state
    global.fetch = jest.fn(() => new Promise(() => {}));

    render(<App />);

    expect(screen.getByText(/connecting to codesync/i)).toBeInTheDocument();
  });

  test('loading spinner disappears after config loads', async () => {
    mockFetchSuccess({
      hasLeetcodeCookie: false,
      hasGithubToken: false,
      targetRepoUrl: null,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/connecting to codesync/i)).not.toBeInTheDocument();
    });
  });
});

describe('App — backend offline', () => {
  test('shows offline screen when fetch throws', async () => {
    mockFetchFailure();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument();
    });
  });

  test('shows Retry Connection button on offline screen', async () => {
    mockFetchFailure();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  test('retry button re-fetches config', async () => {
    mockFetchFailure();

    render(<App />);

    await waitFor(() => screen.getByRole('button', { name: /retry/i }));

    // Switch to success on next call
    mockFetchSuccess({ hasLeetcodeCookie: false, hasGithubToken: false });

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByText(/backend unavailable/i)).not.toBeInTheDocument();
    });
  });

  test('shows backend API URL in offline screen', async () => {
    mockFetchFailure();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/codesync-api/i)).toBeInTheDocument();
    });
  });
});

describe('App — normal render', () => {
  test('renders Sidebar after successful config load', async () => {
    mockFetchSuccess({ hasLeetcodeCookie: false, hasGithubToken: false });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });
  });

  test('renders ConnectSection on default page', async () => {
    mockFetchSuccess({ hasLeetcodeCookie: false, hasGithubToken: false });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('connect-section')).toBeInTheDocument();
    });
  });

  test('does not render repo/sync/history sections on default page', async () => {
    mockFetchSuccess({ hasLeetcodeCookie: false, hasGithubToken: false });

    render(<App />);

    await waitFor(() => screen.getByTestId('connect-section'));

    expect(screen.queryByTestId('repo-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sync-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('history-section')).not.toBeInTheDocument();
  });
});

describe('App — OAuth redirect handling', () => {
  test('?gh_connected=1 shows success notification', async () => {
    setSearchParams('?gh_connected=1');
    mockFetchSuccess({ hasLeetcodeCookie: false, hasGithubToken: true });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(/github connected successfully/i)
      ).toBeInTheDocument();
    });
  });

  test('?gh_connected=1 navigates to repo page', async () => {
    setSearchParams('?gh_connected=1');
    mockFetchSuccess({ hasLeetcodeCookie: false, hasGithubToken: true });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('repo-section')).toBeInTheDocument();
    });
  });

  test('?gh_error=access_denied shows error notification', async () => {
    setSearchParams('?gh_error=access_denied');
    mockFetchSuccess({ hasLeetcodeCookie: false, hasGithubToken: false });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/access_denied/i)).toBeInTheDocument();
    });
  });

  test('?gh_connected calls replaceState to clean the URL', async () => {
    setSearchParams('?gh_connected=1');
    mockFetchSuccess({ hasGithubToken: true });

    render(<App />);

    await waitFor(() => screen.getByTestId('sidebar'));

    expect(window.history.replaceState).toHaveBeenCalledWith({}, '', '/');
  });

  test('notification auto-dismisses after 6 seconds', async () => {
    jest.useFakeTimers();
    setSearchParams('?gh_connected=1');
    mockFetchSuccess({ hasGithubToken: true });

    render(<App />);

    await waitFor(() =>
      screen.getByText(/github connected successfully/i)
    );

    act(() => jest.advanceTimersByTime(6100));

    await waitFor(() => {
      expect(
        screen.queryByText(/github connected successfully/i)
      ).not.toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  test('notification dismiss button removes it immediately', async () => {
    setSearchParams('?gh_connected=1');
    mockFetchSuccess({ hasGithubToken: true });

    render(<App />);

    await waitFor(() =>
      screen.getByText(/github connected successfully/i)
    );

    const dismissBtn = screen.getByRole('button', { name: /✕/ });
    await userEvent.click(dismissBtn);

    await waitFor(() => {
      expect(
        screen.queryByText(/github connected successfully/i)
      ).not.toBeInTheDocument();
    });
  });
});
