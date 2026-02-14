import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KanbanBoard from '../KanbanBoard';

// Mock CSS import
jest.mock('../KanbanBoard.css', () => ({}));

// Mock @dnd-kit modules — use plain functions (not jest.fn) to survive clearAllMocks
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }) => <div data-testid="drag-overlay">{children}</div>,
  useSensor: (sensor, config) => ({ sensor, config }),
  useSensors: (...sensors) => sensors,
  closestCorners: () => null,
  PointerSensor: function PointerSensor() {},
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

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
    // Mock console.error to suppress error logs in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows loading skeleton initially', () => {
    fetch.mockImplementation(() => new Promise(() => {}));
    render(<KanbanBoard />);
    // Skeleton columns are rendered during loading
    const skeletonCols = document.querySelectorAll('.kanban-skeleton-col');
    expect(skeletonCols.length).toBe(6);
  });

  it('renders the kanban title after loading', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText(/Kanban/)).toBeInTheDocument();
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

  it('shows drop zone for empty columns', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      const dropZones = screen.getAllByText('Drop tasks here');
      // backlog, review, and waiting-for-neil columns are empty
      expect(dropZones.length).toBe(3);
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
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
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

    // Modal should show task details
    await waitFor(() => {
      expect(screen.getByText('Edit Task')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Fix login bug')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Users cannot login with special chars')).toBeInTheDocument();
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

  // ─── Search & Filter Tests ─────────────────────────────────────────

  it('renders the search input', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search tasks/)).toBeInTheDocument();
    });
  });

  it('renders priority filter chips', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
    });
  });

  it('filters tasks by search query', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    // Type in search
    const searchInput = screen.getByPlaceholderText(/Search tasks/);
    fireEvent.change(searchInput, { target: { value: 'login' } });

    // Only the login task should be visible
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.queryByText('Add dark mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Update README')).not.toBeInTheDocument();
  });

  it('filters tasks by priority', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    // Click the High priority filter
    fireEvent.click(screen.getByText('High'));

    // Only high priority tasks visible
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.queryByText('Add dark mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Update README')).not.toBeInTheDocument();
  });

  it('shows task count in toolbar', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText(/3\s*tasks/)).toBeInTheDocument();
    });
  });

  it('shows clear button when search has text', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanResponse,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search tasks/);
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Clear button should appear
    const clearBtn = screen.getByLabelText('Clear search');
    expect(clearBtn).toBeInTheDocument();

    // Click clear
    fireEvent.click(clearBtn);

    // Search should be cleared
    expect(searchInput.value).toBe('');
  });
  
  // ─── Delete Task Tests ───────────────────────────────────────────────
  
  describe('Delete Task Functionality', () => {
    it('shows delete confirmation when clicking Delete Task button in edit modal', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanResponse,
      });
  
      render(<KanbanBoard />);
  
      await waitFor(() => {
        expect(screen.getByText('Fix login bug')).toBeInTheDocument();
      });
  
      // Click the task card to open edit modal
      fireEvent.click(screen.getByText('Fix login bug'));
  
      await waitFor(() => {
        expect(screen.getByText('Edit Task')).toBeInTheDocument();
      });
  
      // Click Delete Task button
      fireEvent.click(screen.getByText('Delete Task'));
  
      // Delete confirmation modal should appear with task title
      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to delete task/)).toBeInTheDocument();
        // The task title appears in the confirmation text (wrapped in quotes)
        expect(screen.getByText(/"Fix login bug"/)).toBeInTheDocument();
      });
  
      // Edit modal should be closed
      expect(screen.queryByText('Edit Task')).not.toBeInTheDocument();
    });
  
    it('calls DELETE API when confirming delete', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanResponse,
      });
  
      render(<KanbanBoard />);
  
      await waitFor(() => {
        expect(screen.getByText('Fix login bug')).toBeInTheDocument();
      });
  
      // Click the task card to open edit modal
      fireEvent.click(screen.getByText('Fix login bug'));
  
      await waitFor(() => {
        expect(screen.getByText('Edit Task')).toBeInTheDocument();
      });
  
      // Click Delete Task button
      fireEvent.click(screen.getByText('Delete Task'));
  
      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
      });
  
      // Mock the DELETE response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, deleted: { id: 1 } }),
      });
  
      // Mock the refresh after delete
      const updatedResponse = {
        ...mockKanbanResponse,
        tasks: {
          ...mockKanbanResponse.tasks,
          todo: [], // Task removed
        },
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedResponse,
      });
  
      // Click Delete Task in confirmation modal
      fireEvent.click(screen.getByText('Delete Task').closest('button') || screen.getAllByText('Delete Task')[1]);
  
      // Verify DELETE API was called
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/kanban/tasks/1'),
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });
    });
  
    it('cancelling delete returns to edit modal', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanResponse,
      });
  
      render(<KanbanBoard />);
  
      await waitFor(() => {
        expect(screen.getByText('Fix login bug')).toBeInTheDocument();
      });
  
      // Click the task card to open edit modal
      fireEvent.click(screen.getByText('Fix login bug'));
  
      await waitFor(() => {
        expect(screen.getByText('Edit Task')).toBeInTheDocument();
      });
  
      // Click Delete Task button
      fireEvent.click(screen.getByText('Delete Task'));
  
      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
      });
  
      // Click Cancel in delete confirmation
      fireEvent.click(screen.getByText('Cancel'));
  
      // Delete confirmation should close and edit modal should reappear
      await waitFor(() => {
        expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
        expect(screen.getByText('Edit Task')).toBeInTheDocument();
      });
    });
  
    it('shows error alert when delete API fails', async () => {
      // Mock alert
      const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
  
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanResponse,
      });
  
      render(<KanbanBoard />);
  
      await waitFor(() => {
        expect(screen.getByText('Fix login bug')).toBeInTheDocument();
      });
  
      // Click the task card to open edit modal
      fireEvent.click(screen.getByText('Fix login bug'));
  
      await waitFor(() => {
        expect(screen.getByText('Edit Task')).toBeInTheDocument();
      });
  
      // Click Delete Task button
      fireEvent.click(screen.getByText('Delete Task'));
  
      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
      });
  
      // Mock failed DELETE response
      fetch.mockRejectedValueOnce(new Error('Network error'));
  
      // Click Delete Task in confirmation modal
      fireEvent.click(screen.getByText('Delete Task').closest('button') || screen.getAllByText('Delete Task')[1]);
  
      // Verify error alert was shown
      await waitFor(() => {
        expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Failed to delete task'));
      });
  
      alertMock.mockRestore();
    });
  });
});
