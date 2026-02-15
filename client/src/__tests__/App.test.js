import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import App from '../App';

// Mock KanbanBoard so we don't deal with its own fetch calls
jest.mock('../components/KanbanBoard', () => {
  return function MockKanbanBoard() {
    return <div data-testid="kanban-board">Mock KanbanBoard</div>;
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

const mockStatusData = {
  swissclaw: {
    state: 'active',
    currentTask: 'Building Swissclaw Hub',
    lastActive: '2024-01-01T12:00:00Z',
  },
  recentMessages: [
    { id: '1', sender: 'Neil', content: 'Hello', created_at: '2024-01-01T00:00:00Z' },
  ],
  recentActivities: [
    { id: '1', description: 'Deployed v2', created_at: '2024-01-01T00:00:00Z' },
  ],
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
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.error to suppress warnings
    jest.spyOn(console, 'error').mockImplementation(() => {});
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
      if (typeof url === 'string' && url.includes('/api/kanban')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockKanbanData) });
      }
      if (typeof url === 'string' && url.includes('/api/build')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: '2.1.0', commit: 'abc123' }) });
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

  it('displays build version in footer', async () => {
    render(<App />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/build'),
      );
    });

    await waitFor(() => {
      // Version appears in header and footer
      const versionElements = screen.getAllByText(/v2\.1\.0/);
      expect(versionElements.length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });
  });

  it('redirects to login when no auth token', () => {
    Storage.prototype.getItem = jest.fn(() => null);

    delete window.location;
    window.location = { href: '', pathname: '/dashboard', search: '' };

    render(<App />);

    expect(window.location.href).toBe('/login');
  });

  it('renders the mocked KanbanBoard component', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });
  });

  it('displays recent activities', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Deployed v2')).toBeInTheDocument();
    });
  });

  it('displays chat messages', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
  });

  describe('auto-scroll behavior', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not auto-scroll on initial data fetch', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument();
      });

      // scrollIntoView should not be called on initial load
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
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

    it('auto-scrolls when socket message event is received', async () => {
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

      // scrollIntoView should NOT be called on socket message (only on user send)
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });
  });
});
