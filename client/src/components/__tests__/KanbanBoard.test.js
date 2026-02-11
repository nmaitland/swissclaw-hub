import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KanbanBoard from '../KanbanBoard';

// Mock CSS import
jest.mock('../KanbanBoard.css', () => ({}));

// Mock fetch
global.fetch = jest.fn();

const mockKanbanResponse = {
  columns: [
    { name: 'backlog', displayName: 'Backlog', emoji: '', position: 0 },
    { name: 'todo', displayName: 'To Do', emoji: '', position: 1 },
    { name: 'inProgress', displayName: 'In Progress', emoji: '', position: 2 },
    { name: 'review', displayName: 'Review', emoji: '', position: 3 },
    { name: 'done', displayName: 'Done', emoji: '', position: 4 },
  ],
  tasks: {
    backlog: [],
    todo: [
      {
        id: 1,
        taskId: 'TASK-001',
        title: 'Fix login bug',
        description: 'Users cannot login with special chars',
        priority: 'high',
        assignedTo: 'neil',
        tags: ['bug', 'auth'],
        createdAt: '2024-06-15T10:00:00Z',
        columnName: 'todo',
      },
    ],
    inProgress: [
      {
        id: 2,
        taskId: 'TASK-002',
        title: 'Add dark mode',
        description: 'Theme toggle in settings',
        priority: 'medium',
        assignedTo: 'swissclaw',
        tags: ['feature'],
        createdAt: '2024-06-14T08:00:00Z',
        columnName: 'inProgress',
      },
    ],
    review: [],
    done: [
      {
        id: 3,
        taskId: 'TASK-003',
        title: 'Update README',
        description: '',
        priority: 'low',
        assignedTo: '',
        tags: [],
        createdAt: '2024-06-10T12:00:00Z',
        columnName: 'done',
      },
    ],
  },
};

describe('KanbanBoard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => 'test-token');
    Storage.prototype.setItem = jest.fn();
    Storage.prototype.removeItem = jest.fn();
  });

  it('shows loading state initially', () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    render(<KanbanBoard />);
    expect(screen.getByText('Loading kanban...')).toBeInTheDocument();
  });

  it('renders the kanban title after loading', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText(/Swissclaw Kanban/)).toBeInTheDocument();
    });
  });

  it('renders all column headers', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Backlog')).toBeInTheDocument();
      expect(screen.getByText('To Do')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Review')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByText('Waiting for Neil')).toBeInTheDocument();
    });
  });

  it('renders tasks with titles', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
      expect(screen.getByText('Add dark mode')).toBeInTheDocument();
      expect(screen.getByText('Update README')).toBeInTheDocument();
    });
  });

  it('renders task priorities', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('high')).toBeInTheDocument();
      expect(screen.getByText('medium')).toBeInTheDocument();
      expect(screen.getByText('low')).toBeInTheDocument();
    });
  });

  it('renders task IDs', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('TASK-001')).toBeInTheDocument();
      expect(screen.getByText('TASK-002')).toBeInTheDocument();
      expect(screen.getByText('TASK-003')).toBeInTheDocument();
    });
  });

  it('renders task descriptions', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Users cannot login with special chars')).toBeInTheDocument();
      expect(screen.getByText('Theme toggle in settings')).toBeInTheDocument();
    });
  });

  it('renders assigned user names', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText(/neil/)).toBeInTheDocument();
      expect(screen.getByText(/swissclaw/)).toBeInTheDocument();
    });
  });

  it('renders tags on task cards', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('bug')).toBeInTheDocument();
      expect(screen.getByText('auth')).toBeInTheDocument();
      expect(screen.getByText('feature')).toBeInTheDocument();
    });
  });

  it('shows "No tasks" for empty columns', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      const emptyMessages = screen.getAllByText('No tasks');
      // backlog, review, and waiting-for-neil columns are empty
      expect(emptyMessages.length).toBe(3);
    });
  });

  it('shows task count per column', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      // Column counts are rendered as text - todo has 1 task, inProgress has 1, done has 1
      const countElements = screen.getAllByText('1');
      expect(countElements.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('handles API error gracefully', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load kanban board')).toBeInTheDocument();
    });
  });

  it('handles non-ok response', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load kanban board')).toBeInTheDocument();
    });
  });

  it('redirects on 401 response', async () => {
    delete window.location;
    window.location = { href: '' };

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(window.location.href).toBe('/login');
    });
  });

  it('sends auth token with fetch request', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/kanban'),
        expect.objectContaining({
          headers: { 'Authorization': 'Bearer test-token' },
        })
      );
    });
  });

  it('opens task detail modal when clicking a task', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    // Click the task card
    fireEvent.click(screen.getByText('Fix login bug'));

    // Modal should show task details with move buttons
    await waitFor(() => {
      expect(screen.getByText('Move to:')).toBeInTheDocument();
      expect(screen.getByText('Priority:')).toBeInTheDocument();
    });
  });

  it('opens add task modal when clicking + button', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Backlog')).toBeInTheDocument();
    });

    // Click the first + button (Backlog column)
    const addButtons = screen.getAllByTitle('Add task');
    fireEvent.click(addButtons[0]);

    // Add task modal should appear
    await waitFor(() => {
      expect(screen.getByText('Add Task to Backlog')).toBeInTheDocument();
      expect(screen.getByLabelText('Title *')).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
      expect(screen.getByLabelText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Create Task')).toBeInTheDocument();
    });
  });

  it('closes add task modal when clicking Cancel', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Backlog')).toBeInTheDocument();
    });

    // Open add modal
    const addButtons = screen.getAllByTitle('Add task');
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Create Task')).toBeInTheDocument();
    });

    // Click cancel
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Create Task')).not.toBeInTheDocument();
    });
  });
});
