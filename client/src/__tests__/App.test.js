import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    close: jest.fn(),
  })),
}));

// Mock fetch
global.fetch = jest.fn();

const mockStatusData = {
  status: 'Working',
  currentTask: 'Test task',
  recentMessages: [
    { id: '1', content: 'Test message', created_at: '2024-01-01T00:00:00Z' }
  ],
  recentActivities: [
    { id: '1', description: 'Test activity', created_at: '2024-01-01T00:00:00Z' }
  ]
};

const mockKanbanData = [
  {
    id: 'task-1',
    title: 'Test Task',
    description: 'Test description',
    status: 'todo',
    priority: 'medium',
    assigned_to: 'swissclaw',
    column: 'todo'
  }
];

describe('App Component', () => {
  beforeEach(() => {
    fetch.mockClear();
    localStorage.clear();
    
    // Mock successful auth
    localStorage.setItem('authToken', 'test-token');
  });

  it('renders the main dashboard', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatusData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanData,
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test task')).toBeInTheDocument();
      expect(screen.getByText('Test Task')).toBeInTheDocument();
    });
  });

  it('redirects to login when no auth token', () => {
    localStorage.removeItem('authToken');
    
    // Mock window.location.href
    delete window.location;
    window.location = { href: '' };

    render(<App />);

    expect(window.location.href).toBe('/login');
  });

  it('handles authentication errors', async () => {
    fetch.mockResolvedValueOnce({
      status: 401,
      json: async () => ({ error: 'Authentication required' })
    });

    delete window.location;
    window.location = { href: '' };

    render(<App />);

    await waitFor(() => {
      expect(window.location.href).toBe('/login');
    });
  });

  it('sends chat messages', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatusData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanData,
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const messageInput = screen.getByPlaceholderText(/type a message/i);
    const sendButton = screen.getByText(/send/i);

    userEvent.type(messageInput, 'Test message');
    userEvent.click(sendButton);

    await waitFor(() => {
      expect(messageInput.value).toBe('');
    });
  });

  it('displays build information', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatusData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '2.1.0', commit: 'abc123' })
      });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/2\.1\.0/)).toBeInTheDocument();
      expect(screen.getByText(/abc123/)).toBeInTheDocument();
    });
  });

  it('handles network errors gracefully', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/failed to fetch data/i)).toBeInTheDocument();
    });
  });

  it('refreshes data periodically', async () => {
    jest.useFakeTimers();

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatusData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanData,
      });

    render(<App />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2); // Initial fetch for status and kanban
    });

    // Fast-forward 30 seconds
    jest.advanceTimersByTime(30000);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(4); // Should fetch again
    });

    jest.useRealTimers();
  });
});
