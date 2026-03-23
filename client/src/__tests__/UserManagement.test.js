import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserManagement from '../components/UserManagement';

const mockUsers = [
  {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    lastLogin: new Date().toISOString(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    googleId: null,
  },
  {
    id: 'user-2',
    email: 'regular@example.com',
    name: 'Regular User',
    role: 'user',
    lastLogin: null,
    failedLoginAttempts: 2,
    lockedUntil: null,
    googleId: null,
  },
  {
    id: 'user-3',
    email: 'locked@example.com',
    name: 'Locked User',
    role: 'user',
    lastLogin: '2026-03-20T12:00:00Z',
    failedLoginAttempts: 5,
    lockedUntil: new Date(Date.now() + 900000).toISOString(), // locked for 15 min
    googleId: 'google-123',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  Storage.prototype.getItem = jest.fn((key) => {
    if (key === 'authToken') return 'test-token';
    return null;
  });

  global.fetch = jest.fn((url) => {
    if (typeof url === 'string' && url.includes('/api/admin/users')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ users: mockUsers }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('UserManagement', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <UserManagement isOpen={false} onClose={jest.fn()} currentUserId="user-1" />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders user table when open', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('Regular User')).toBeInTheDocument();
    expect(screen.getByText('Locked User')).toBeInTheDocument();
  });

  it('shows locked status for locked users', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Locked')).toBeInTheDocument();
    });
  });

  it('shows failed attempts warning', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('2 fails')).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    );

    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load users')).toBeInTheDocument();
    });
  });

  it('shows access denied for 403', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) })
    );

    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeInTheDocument();
    });
  });

  it('toggles add user form', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('+ Add User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add User'));
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();

    // Click cancel
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Email')).not.toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', async () => {
    const onClose = jest.fn();
    render(
      <UserManagement isOpen={true} onClose={onClose} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    // Click the overlay (dialog element)
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when modal content is clicked', async () => {
    const onClose = jest.fn();
    render(
      <UserManagement isOpen={true} onClose={onClose} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    // Click on the modal title (inside content)
    fireEvent.click(screen.getByText('User Management'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('enables inline name editing on click', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Regular User')).toBeInTheDocument();
    });

    // Click to edit
    fireEvent.click(screen.getByText('Regular User'));

    // Should show an input with the current name
    const input = screen.getByDisplayValue('Regular User');
    expect(input).toBeInTheDocument();

    // Should show Save button
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('shows delete confirmation flow', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Regular User')).toBeInTheDocument();
    });

    // Find delete buttons (not for current user)
    const deleteButtons = screen.getAllByTitle('Delete user');
    fireEvent.click(deleteButtons[0]);

    // Should show confirm/cancel
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getAllByText('Cancel').length).toBeGreaterThan(0);

    // Cancel should go back to delete button
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
  });

  it('shows unlock button for locked users', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Unlock')).toBeInTheDocument();
    });
  });

  it('does not show delete button for current user', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    // There should be delete buttons, but only for non-current users
    const deleteButtons = screen.getAllByTitle('Delete user');
    // user-1 is current, so delete should only appear for user-2 and user-3
    expect(deleteButtons.length).toBe(2);
  });

  it('shows change password button for each user', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const changeButtons = screen.getAllByText('Change');
    expect(changeButtons.length).toBe(3); // one per user
  });

  it('expands password input on Change click', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const changeButtons = screen.getAllByText('Change');
    fireEvent.click(changeButtons[0]);

    expect(screen.getByPlaceholderText('New password')).toBeInTheDocument();
  });

  it('disables role dropdown for current user', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    // Find all role selects
    const selects = document.querySelectorAll('.um-role-select');
    // First user (admin, currentUser) should be disabled
    expect(selects[0]).toBeDisabled();
    // Second user should be enabled
    expect(selects[1]).not.toBeDisabled();
  });

  it('shows auth method for Google users', async () => {
    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Locked User')).toBeInTheDocument();
    });

    // User 3 has googleId set
    expect(screen.getByText('Both')).toBeInTheDocument();
  });

  it('dismisses error when dismiss button is clicked', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    );

    render(
      <UserManagement isOpen={true} onClose={jest.fn()} currentUserId="user-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load users')).toBeInTheDocument();
    });

    // Click the dismiss button (×)
    const dismissBtn = document.querySelector('.um-error-dismiss');
    fireEvent.click(dismissBtn);

    expect(screen.queryByText('Failed to load users')).not.toBeInTheDocument();
  });
});
