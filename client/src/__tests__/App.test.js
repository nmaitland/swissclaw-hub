import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('renders the header', async () => {
    render(<App />);
    const headings = screen.getAllByText(/Swissclaw Hub/);
    expect(headings.length).toBeGreaterThanOrEqual(1);
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

  it('shows idle state before data loads', () => {
    fetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<App />);

    expect(screen.getByText('idle')).toBeInTheDocument();
    expect(screen.getByText('Ready to help')).toBeInTheDocument();
  });

  it('renders the chat input', async () => {
    render(<App />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  it('renders kanban stat cards', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('To Do')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Total Tasks')).toBeInTheDocument();
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
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
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
});
