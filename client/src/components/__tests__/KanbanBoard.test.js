import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KanbanBoard from '../KanbanBoard';

// Mock the socket.io client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    close: jest.fn(),
  })),
}));

// Mock fetch
global.fetch = jest.fn();

const mockKanbanData = [
  {
    id: 'task-1',
    title: 'Test Task 1',
    description: 'Description for test task 1',
    status: 'todo',
    priority: 'high',
    assigned_to: 'swissclaw',
    column: 'todo',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'task-2',
    title: 'Test Task 2',
    description: 'Description for test task 2',
    status: 'inprogress',
    priority: 'medium',
    assigned_to: 'neil',
    column: 'inprogress',
    created_at: '2024-01-02T00:00:00Z',
  },
];

describe('KanbanBoard Component', () => {
  beforeEach(() => {
    fetch.mockClear();
    localStorage.clear();
  });

  it('renders kanban board with tasks', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanData,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
      expect(screen.getByText('Test Task 2')).toBeInTheDocument();
    });
  });

  it('displays tasks in correct columns', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanData,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
      expect(screen.getByText('Test Task 2')).toBeInTheDocument();
    });

    // Check that tasks are in their respective columns
    // This assumes the component renders columns with specific test IDs
    const todoColumn = screen.getByTestId('column-todo');
    const inProgressColumn = screen.getByTestId('column-inprogress');

    expect(todoColumn).toContainElement(screen.getByText('Test Task 1'));
    expect(inProgressColumn).toContainElement(screen.getByText('Test Task 2'));
  });

  it('handles API errors gracefully', async () => {
    fetch.mockRejectedValueOnce(new Error('API Error'));

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<KanbanBoard />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('allows creating new tasks', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'new-task', title: 'New Task' }),
      });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
    });

    // Click add task button
    const addTaskButton = screen.getByText(/add task/i);
    userEvent.click(addTaskButton);

    // Fill in form
    const titleInput = screen.getByLabelText(/title/i);
    const descriptionInput = screen.getByLabelText(/description/i);
    const submitButton = screen.getByText(/create/i);

    userEvent.type(titleInput, 'New Task');
    userEvent.type(descriptionInput, 'New task description');
    userEvent.click(submitButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/kanban'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('New Task'),
        })
      );
    });
  });

  it('filters tasks by assignee', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockKanbanData,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
    });

    // Filter by swissclaw
    const filterSelect = screen.getByLabelText(/filter by/i);
    userEvent.selectOptions(filterSelect, 'swissclaw');

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
      expect(screen.queryByText('Test Task 2')).not.toBeInTheDocument();
    });
  });

  it('updates task status when dragging between columns', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockKanbanData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'task-1', column: 'done' }),
      });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText('Test Task 1')).toBeInTheDocument();
    });

    // Simulate drag and drop
    const task = screen.getByText('Test Task 1');
    const doneColumn = screen.getByTestId('column-done');

    // This would need to be implemented based on the actual drag-and-drop library used
    fireEvent.dragStart(task);
    fireEvent.dragOver(doneColumn);
    fireEvent.drop(doneColumn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/kanban/task-1',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('done'),
        })
      );
    });
  });
});
