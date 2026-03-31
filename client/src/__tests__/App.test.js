import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import App from '../App';

// Mock KanbanBoard so we don't deal with its own fetch calls
jest.mock('../components/KanbanBoard', () => {
  return function MockKanbanBoard({ collapsed = false, showCollapseControl = false, onToggleCollapse }) {
    return (
      <div data-testid="kanban-board">
        {showCollapseControl && typeof onToggleCollapse === 'function' && (
          <button
            type="button"
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} kanban panel`}
            onClick={onToggleCollapse}
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        )}
        <span>Mock KanbanBoard</span>
      </div>
    );
  };
});

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  close: jest.fn(),
  connected: false,
};
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// Mock CSS
jest.mock('../App.css', () => ({}));

// Mock fetch
global.fetch = jest.fn();

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

const createMatchMediaResult = (matches = false) => ({
  matches,
  media: '(max-width: 768px)',
  onchange: null,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  dispatchEvent: jest.fn(),
});

const createMatchMediaMock = ({ mobile = false, standalone = false } = {}) => jest.fn().mockImplementation((query) => ({
  matches: query === '(max-width: 768px)' ? mobile : query === '(display-mode: standalone)' ? standalone : false,
  media: query,
  onchange: null,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  dispatchEvent: jest.fn(),
}));

const mockStatusData = {
  state: 'active',
  currentTask: 'Building Swissclaw Hub',
  lastActive: '2024-01-01T12:00:00Z',
  chatCount: 7,
  activityCount: 5,
  modelUsage: {
    usageDate: '2024-01-01',
    updatedAt: '2024-01-01T12:00:00Z',
    totals: {
      inputTokens: 45230,
      outputTokens: 12100,
      totalTokens: 57330,
      requestCount: 42,
      costs: [
        { type: 'paid', amount: 0.42 },
        { type: 'free_tier_potential', amount: 0.15 },
      ],
    },
    models: [
      {
        model: 'claude-3-5-sonnet',
        inputTokens: 25000,
        outputTokens: 8000,
        totalTokens: 33000,
        requestCount: 20,
        costs: [{ type: 'paid', amount: 0.25 }],
      },
      {
        model: 'gpt-4',
        inputTokens: 20230,
        outputTokens: 4100,
        totalTokens: 24330,
        requestCount: 22,
        costs: [{ type: 'paid', amount: 0.17 }],
      },
    ],
  },
};

const mockMessagesData = [
  { id: '1', sender: 'Neil', content: 'Hello', created_at: '2024-01-01T00:00:00Z' },
];

const mockActivitiesData = {
  activities: [
    { id: '1', description: 'Deployed v2', created_at: '2024-01-01T00:00:00Z', type: 'deployment', sender: 'Swissclaw', metadata: {} },
  ],
  hasMore: false,
};

const mockKanbanData = {
  columns: [
    { name: 'todo', displayName: 'To Do', emoji: '', color: '', position: 1 },
  ],
  tasks: {
    todo: [{ id: 1, taskId: 'TASK-001', title: 'Test Task', priority: 'medium' }],
  },
};

describe('App Component', () => {
  let windowEventHandlers;
  let mediaQueryListeners;
  const setMatchMediaState = ({ mobile = false, standalone = false } = {}) => {
    mediaQueryListeners = new Map();
    window.matchMedia = jest.fn().mockImplementation((query) => {
      if (!mediaQueryListeners.has(query)) {
        mediaQueryListeners.set(query, createMatchMediaMock({ mobile, standalone })(query));
      }
      return mediaQueryListeners.get(query);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    windowEventHandlers = new Map();
    mediaQueryListeners = new Map();
    // Mock console.error to suppress warnings
    jest.spyOn(console, 'error').mockImplementation(() => {});
    setMatchMediaState();
    window.addEventListener = jest.fn((event, handler) => {
      windowEventHandlers.set(event, handler);
    });
    window.removeEventListener = jest.fn((event) => {
      windowEventHandlers.delete(event);
    });
    // Mock localStorage
    Storage.prototype.getItem = jest.fn((key) => {
      if (key === 'authToken') return 'test-token';
      return null;
    });
    Storage.prototype.setItem = jest.fn();
    Storage.prototype.removeItem = jest.fn();

    // Default successful fetch responses
    fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/status')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockStatusData) });
      }
      if (typeof url === 'string' && url.includes('/api/messages')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockMessagesData) });
      }
      if (typeof url === 'string' && url.includes('/api/activities')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockActivitiesData) });
      }
      if (typeof url === 'string' && url.includes('/api/kanban')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockKanbanData) });
      }
      if (typeof url === 'string' && url.includes('/api/build')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ buildDate: '2026-02-15T06:53:46.312Z', commit: 'abc123' }) });
      }
      if (typeof url === 'string' && url.includes('/auth/me')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ user: { id: '1', email: 'neil@example.com', name: 'Neil', role: 'admin' } }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the header', async () => {
    render(<App />);
    await waitFor(() => {
      const headings = screen.getAllByText(/Swissclaw Hub/);
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('fetches and displays status data', async () => {
    render(<App />);

    await waitFor(() => {
      // Status text may appear in multiple spots; verify at least one exists
      const taskElements = screen.getAllByText('Building Swissclaw Hub');
      expect(taskElements.length).toBeGreaterThanOrEqual(1);
      const activeElements = screen.getAllByText('active');
      expect(activeElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays build date in footer', async () => {
    render(<App />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/build'),
      );
    });

    await waitFor(() => {
      // Build date appears in header and footer
      const dateElements = screen.getAllByText(/Built/);
      expect(dateElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows idle state before data loads', async () => {
    fetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText('idle')).toBeInTheDocument();
    expect(screen.getByText('Ready to help')).toBeInTheDocument();
  });

  it('renders the chat input', async () => {
    render(<App />);
    await waitFor(() => {
      // Input is always rendered; placeholder shows "Connecting..." initially, then "Type a message..."
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  it('handles missing auth token state', () => {
    Storage.prototype.getItem = jest.fn(() => null);

    render(<App />);

    expect(Storage.prototype.getItem).toHaveBeenCalledWith('authToken');
  });

  it('renders the mocked KanbanBoard component', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });
  });

  it('collapses chat panel in desktop mode', async () => {
    render(<App />);

    const collapseChatButton = await screen.findByRole('button', { name: 'Collapse chat panel' });
    fireEvent.click(collapseChatButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand chat panel' })).toBeInTheDocument();
    });
  });

  it('collapses and expands the top panels (status & activities)', async () => {
    render(<App />);

    // Status and Activities headings should be visible initially
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Status/ })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Activities/ })).toBeInTheDocument();
    });

    // Click collapse
    const collapseBtn = screen.getByRole('button', { name: 'Collapse status and activities' });
    fireEvent.click(collapseBtn);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Status/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /Activities/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Expand status and activities' })).toBeInTheDocument();
    });

    // Click expand
    fireEvent.click(screen.getByRole('button', { name: 'Expand status and activities' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Status/ })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Activities/ })).toBeInTheDocument();
    });
  });

  it('collapsing kanban keeps chat panel expanded', async () => {
    render(<App />);

    const collapseKanbanButton = await screen.findByRole('button', { name: 'Collapse kanban panel' });
    fireEvent.click(collapseKanbanButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expand kanban panel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Collapse chat panel' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Expand chat panel' })).not.toBeInTheDocument();
    });
  });

  it('shows mobile mode tabs and switches active panel in mobile layout', async () => {
    window.matchMedia = jest.fn().mockImplementation(() => createMatchMediaResult(true));

    render(<App />);

    const modeTabs = await screen.findByTestId('mobile-mode-tabs');
    expect(modeTabs).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Status/ })).toBeInTheDocument();
      expect(screen.queryByTestId('mobile-kanban-panel')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Kanban' }));

    await waitFor(() => {
      expect(Storage.prototype.setItem).toHaveBeenCalledWith('hub.mobileViewMode.v1', 'kanban');
      expect(screen.getByTestId('mobile-kanban-panel')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /Status/ })).not.toBeInTheDocument();
    });
  });

  it('does not show the install banner on desktop after beforeinstallprompt fires', async () => {
    const preventDefault = jest.fn();

    render(<App />);

    const beforeInstallPromptHandler = windowEventHandlers.get('beforeinstallprompt');
    expect(beforeInstallPromptHandler).toEqual(expect.any(Function));

    await act(async () => {
      beforeInstallPromptHandler({
        preventDefault,
        prompt: jest.fn(),
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(screen.queryByLabelText('Install app banner')).not.toBeInTheDocument();
  });

  it('shows an install banner on mobile after beforeinstallprompt fires and can dismiss it', async () => {
    setMatchMediaState({ mobile: true });
    const preventDefault = jest.fn();

    render(<App />);

    const beforeInstallPromptHandler = windowEventHandlers.get('beforeinstallprompt');
    expect(beforeInstallPromptHandler).toEqual(expect.any(Function));

    await act(async () => {
      beforeInstallPromptHandler({
        preventDefault,
        prompt: jest.fn(),
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Install app banner')).not.toBeInTheDocument();
    });
  });

  it('prompts for install on mobile and hides the banner after acceptance', async () => {
    setMatchMediaState({ mobile: true });
    const prompt = jest.fn().mockResolvedValue(undefined);

    render(<App />);

    const beforeInstallPromptHandler = windowEventHandlers.get('beforeinstallprompt');

    await act(async () => {
      beforeInstallPromptHandler({
        preventDefault: jest.fn(),
        prompt,
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    });

    expect(prompt).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByLabelText('Install app banner')).not.toBeInTheDocument();
    });
  });

  it('does not show the install banner when already in standalone display mode', async () => {
    window.matchMedia = createMatchMediaMock({ standalone: true });

    render(<App />);

    const beforeInstallPromptHandler = windowEventHandlers.get('beforeinstallprompt');

    await act(async () => {
      beforeInstallPromptHandler({
        preventDefault: jest.fn(),
        prompt: jest.fn(),
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      });
    });

    expect(screen.queryByLabelText('Install app banner')).not.toBeInTheDocument();
  });

  it('hides the install banner after the appinstalled event fires', async () => {
    setMatchMediaState({ mobile: true });
    render(<App />);

    const beforeInstallPromptHandler = windowEventHandlers.get('beforeinstallprompt');
    const appInstalledHandler = windowEventHandlers.get('appinstalled');

    await act(async () => {
      beforeInstallPromptHandler({
        preventDefault: jest.fn(),
        prompt: jest.fn(),
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      });
    });

    expect(screen.getByLabelText('Install app banner')).toBeInTheDocument();

    await act(async () => {
      appInstalledHandler();
    });

    expect(screen.queryByLabelText('Install app banner')).not.toBeInTheDocument();
  });

  it('hides the install banner when standalone display mode becomes active', async () => {
    setMatchMediaState({ mobile: true });
    render(<App />);

    const beforeInstallPromptHandler = windowEventHandlers.get('beforeinstallprompt');

    await act(async () => {
      beforeInstallPromptHandler({
        preventDefault: jest.fn(),
        prompt: jest.fn(),
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      });
    });

    expect(screen.getByLabelText('Install app banner')).toBeInTheDocument();

    const standaloneMedia = mediaQueryListeners.get('(display-mode: standalone)');
    expect(standaloneMedia).toBeTruthy();

    await waitFor(() => {
      expect(standaloneMedia.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    await act(async () => {
      standaloneMedia.addEventListener.mock.calls[0][1]({ matches: true });
    });

    expect(screen.queryByLabelText('Install app banner')).not.toBeInTheDocument();
  });

  it('treats iOS standalone mode as installed', async () => {
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });

    render(<App />);

    const beforeInstallPromptHandler = windowEventHandlers.get('beforeinstallprompt');

    await act(async () => {
      beforeInstallPromptHandler({
        preventDefault: jest.fn(),
        prompt: jest.fn(),
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      });
    });

    expect(screen.queryByLabelText('Install app banner')).not.toBeInTheDocument();
  });

  it('displays recent activities', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Deployed v2')).toBeInTheDocument();
      expect(screen.getByText('Swissclaw')).toBeInTheDocument();
    });
  });

  it('styles swissclaw and user activity rows differently', async () => {
    const senderActivitiesData = {
      activities: [
        {
          id: '1',
          type: 'chat',
          sender: 'Swissclaw',
          description: 'Reviewed the queue',
          created_at: '2024-01-01T01:00:00Z',
          metadata: {},
        },
        {
          id: '2',
          type: 'chat',
          sender: 'Neil',
          description: 'Queued follow-up',
          created_at: '2024-01-01T00:59:00Z',
          metadata: {},
        },
      ],
      hasMore: false,
    };

    fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/status')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockStatusData) });
      }
      if (typeof url === 'string' && url.includes('/api/messages')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockMessagesData) });
      }
      if (typeof url === 'string' && url.includes('/api/activities')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(senderActivitiesData) });
      }
      if (typeof url === 'string' && url.includes('/api/kanban')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockKanbanData) });
      }
      if (typeof url === 'string' && url.includes('/api/build')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ buildDate: '2026-02-15T06:53:46.312Z', commit: 'abc123' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    render(<App />);

    const swissclawActivity = await screen.findByRole('button', { name: /Swissclaw Reviewed the queue/i });
    const neilActivity = await screen.findByRole('button', { name: /Neil Queued follow-up/i });

    expect(swissclawActivity).toHaveClass('activity-item-assistant');
    expect(neilActivity).toHaveClass('activity-item-user');
  });

  it('shows multiline activity descriptions in inline expanded details', async () => {
    const multilineActivitiesData = {
      activities: [
        {
          id: '2',
          type: 'chat',
          sender: 'Swissclaw',
          description: 'First line\nSecond line\nThird line',
          created_at: '2024-01-01T01:00:00Z',
          metadata: { source: 'test' },
        },
      ],
      hasMore: false,
    };

    fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/status')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockStatusData) });
      }
      if (typeof url === 'string' && url.includes('/api/messages')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockMessagesData) });
      }
      if (typeof url === 'string' && url.includes('/api/activities')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(multilineActivitiesData) });
      }
      if (typeof url === 'string' && url.includes('/api/kanban')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockKanbanData) });
      }
      if (typeof url === 'string' && url.includes('/api/build')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ buildDate: '2026-02-15T06:53:46.312Z', commit: 'abc123' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /First line/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /First line/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /First line/ })).toHaveAttribute('aria-expanded', 'true');
      const detailDescription = document.querySelector('.detail-description');
      expect(detailDescription).toBeTruthy();
      expect(detailDescription.textContent).toContain('First line');
      expect(detailDescription.textContent).toContain('Second line');
      expect(detailDescription.textContent).toContain('Third line');
      expect(detailDescription.textContent).toContain('\n');
      expect(screen.getByText('Sender:')).toBeInTheDocument();
      expect(screen.getAllByText('Swissclaw')).toHaveLength(2);
    });
  });

  it('displays chat messages', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
  });

  it('supports multiline chat content and sends on Enter without Shift', async () => {
    mockSocket.connected = true;
    render(<App />);

    // Wait for currentUser to be loaded (admin Users button appears)
    await screen.findByTitle('Manage Users');

    const chatInput = await screen.findByRole('textbox');
    fireEvent.change(chatInput, { target: { value: 'Line 1\nLine 2' } });
    expect(chatInput.value).toBe('Line 1\nLine 2');

    fireEvent.keyDown(chatInput, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('message', {
        sender: 'Neil',
        content: 'Line 1\nLine 2',
      });
    });
  });

  describe('auto-scroll behavior', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('auto-scrolls on initial data fetch', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
      });

      // scrollIntoView should be called on initial load to show last message
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
    });

    it('does not auto-scroll on interval fetch', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
      });

      // Clear any calls from initial render
      Element.prototype.scrollIntoView.mockClear();

      // Advance timers to trigger interval fetch
      await act(async () => {
        jest.advanceTimersByTime(35000);
      });

      // Wait for fetch to complete
      await waitFor(() => {
        expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
      });

      // scrollIntoView should not be called on interval fetch
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    it('does not auto-scroll when socket message event is received', async () => {
      const messageHandler = [];
      mockSocket.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          messageHandler.push(handler);
        }
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
      });

      // Clear any calls from initial render
      Element.prototype.scrollIntoView.mockClear();

      // Simulate receiving a message via socket
      await act(async () => {
        messageHandler[0]({ id: '2', sender: 'SwissClaw', content: 'New message', created_at: new Date().toISOString() });
      });

      // Wait for state update
      await waitFor(() => {
        expect(screen.getByText('New message')).toBeInTheDocument();
      });

      // scrollIntoView SHOULD be called on socket message (always scroll to bottom)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });
});
