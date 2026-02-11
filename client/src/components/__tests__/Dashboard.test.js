import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Dashboard from '../Dashboard';

const defaultProps = {
  user: { id: '1', name: 'Neil', email: 'neil@test.com', role: 'admin' },
  status: [],
  messages: [],
  kanban: [],
  activities: [],
  health: null,
  socket: null,
  loading: false,
  error: null,
  onLogout: jest.fn(),
  token: 'test-token',
};

describe('Dashboard component', () => {
  beforeEach(() => {
    defaultProps.onLogout.mockClear();
  });

  it('renders the dashboard header with user name', () => {
    render(<Dashboard {...defaultProps} />);

    expect(screen.getByText('Swissclaw Hub Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Welcome, Neil/)).toBeInTheDocument();
  });

  it('calls onLogout when logout button is clicked', () => {
    render(<Dashboard {...defaultProps} />);

    fireEvent.click(screen.getByText('Logout'));
    expect(defaultProps.onLogout).toHaveBeenCalledTimes(1);
  });

  it('displays error message when error is set', () => {
    render(<Dashboard {...defaultProps} error="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays loading indicator when loading', () => {
    render(<Dashboard {...defaultProps} loading={true} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('does not display loading when not loading', () => {
    render(<Dashboard {...defaultProps} loading={false} />);

    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('renders status updates', () => {
    const status = [
      { id: '1', status: 'Active', current_task: 'Building', last_updated: '2024-01-01T00:00:00Z' },
    ];
    render(<Dashboard {...defaultProps} status={status} />);

    expect(screen.getByText('Status Updates')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders kanban columns', () => {
    render(<Dashboard {...defaultProps} />);

    expect(screen.getByText('Kanban Board')).toBeInTheDocument();
    expect(screen.getByText('backlog')).toBeInTheDocument();
    expect(screen.getByText('todo')).toBeInTheDocument();
    expect(screen.getByText('inprogress')).toBeInTheDocument();
    expect(screen.getByText('review')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('renders kanban tasks in correct columns', () => {
    const kanban = [
      { id: '1', title: 'My Task', description: 'Task desc', column: 'todo', priority: 'high' },
    ];
    render(<Dashboard {...defaultProps} kanban={kanban} />);

    expect(screen.getByText('My Task')).toBeInTheDocument();
    expect(screen.getByText('Task desc')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('renders messages', () => {
    const messages = [
      { id: '1', sender: { name: 'Neil' }, content: 'Hello world', created_at: '2024-01-01T00:00:00Z' },
    ];
    render(<Dashboard {...defaultProps} messages={messages} />);

    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Neil:')).toBeInTheDocument();
  });

  it('renders activities', () => {
    const activities = [
      { id: '1', description: 'Deployed to production', created_at: '2024-01-01T00:00:00Z' },
    ];
    render(<Dashboard {...defaultProps} activities={activities} />);

    expect(screen.getByText('Recent Activities')).toBeInTheDocument();
    expect(screen.getByText('Deployed to production')).toBeInTheDocument();
  });

  it('renders health section when health data is available', () => {
    const health = { status: 'ok', uptime: 12345 };
    render(<Dashboard {...defaultProps} health={health} />);

    expect(screen.getByText('System Health')).toBeInTheDocument();
    expect(screen.getByText(/Status: ok/)).toBeInTheDocument();
    expect(screen.getByText(/Uptime: 12345s/)).toBeInTheDocument();
  });

  it('does not render health section when health is null', () => {
    render(<Dashboard {...defaultProps} health={null} />);

    expect(screen.queryByText('System Health')).not.toBeInTheDocument();
  });
});
