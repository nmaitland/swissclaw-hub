import React, { useState, useEffect, useCallback } from 'react';
import type { AdminUser } from '../types';
import './UserManagement.css';

const API_URL = process.env.REACT_APP_API_URL || '';

const getAuthToken = (): string | null => localStorage.getItem('authToken');

const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
};

const formatRelativeTime = (dateStr: string | null): string => {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const getAuthMethod = (user: AdminUser): string => {
  const has_password = true; // We can't see password_hash from the API, assume if no googleId then password
  const has_google = !!user.googleId;
  if (has_google && has_password) return 'Both';
  if (has_google) return 'Google';
  return 'Password';
};

interface UserManagementProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
}

export default function UserManagement({ isOpen, onClose, currentUserId }: UserManagementProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Inline editing state
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [editPasswordValue, setEditPasswordValue] = useState('');

  // Add user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newGoogleId, setNewGoogleId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/users`, { headers: authHeaders() });
      if (!res.ok) {
        setError(res.status === 403 ? 'Access denied' : 'Failed to load users');
        return;
      }
      const data = await res.json();
      setUsers(data.users);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setShowAddForm(false);
      setDeleteConfirm(null);
      setEditingName(null);
      setEditingPassword(null);
    }
  }, [isOpen, fetchUsers]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    try {
      const body: Record<string, string> = {
        email: newEmail.trim(),
        name: newName.trim(),
        role: newRole,
      };
      if (newPassword) body.password = newPassword;
      if (newGoogleId.trim()) body.googleId = newGoogleId.trim();

      const res = await fetch(`${API_URL}/api/admin/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || 'Failed to create user');
        return;
      }

      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRole('user');
      setNewGoogleId('');
      setShowAddForm(false);
      fetchUsers();
    } catch {
      setFormError('Failed to create user');
    } finally {
      setFormLoading(false);
    }
  };

  const handlePatchUser = async (userId: string, updates: Record<string, string>) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        fetchUsers();
        return true;
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update user');
        return false;
      }
    } catch {
      setError('Failed to update user');
      return false;
    }
  };

  const handleNameSave = async (userId: string) => {
    const trimmed = editNameValue.trim();
    if (!trimmed) return;
    const ok = await handlePatchUser(userId, { name: trimmed });
    if (ok) setEditingName(null);
  };

  const handlePasswordSave = async (userId: string) => {
    if (!editPasswordValue) return;
    const ok = await handlePatchUser(userId, { password: editPasswordValue });
    if (ok) {
      setEditingPassword(null);
      setEditPasswordValue('');
    }
  };

  const handleUnlock = async (userId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/unlock`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to unlock user');
      }
    } catch {
      setError('Failed to unlock user');
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete user');
      }
    } catch {
      setError('Failed to delete user');
    }
  };

  if (!isOpen) return null;

  const isLocked = (user: AdminUser): boolean =>
    !!user.lockedUntil && new Date(user.lockedUntil) > new Date();

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-management-title"
      onClick={onClose}
    >
      <div className="modal-content user-management-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="user-management-title">User Management</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            {'\u00D7'}
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="um-error">
              {error}
              <button className="um-error-dismiss" onClick={() => setError(null)}>{'\u00D7'}</button>
            </div>
          )}

          <div className="um-toolbar">
            <button
              className="um-add-btn"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? 'Cancel' : '+ Add User'}
            </button>
            <button className="um-refresh-btn" onClick={fetchUsers} disabled={loading}>
              Refresh
            </button>
          </div>

          {showAddForm && (
            <form className="um-add-form" onSubmit={handleAddUser}>
              <div className="um-form-row">
                <input
                  type="email"
                  placeholder="Email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div className="um-form-row">
                <input
                  type="password"
                  placeholder="Password (optional — Google users don't need one)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="um-form-row">
                <button type="submit" className="um-submit-btn" disabled={formLoading}>
                  {formLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
              {formError && <div className="um-form-error">{formError}</div>}
            </form>
          )}

          {loading ? (
            <div className="um-loading">Loading users...</div>
          ) : (
            <div className="um-table-wrapper">
              <table className="um-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Password</th>
                    <th>Auth</th>
                    <th>Last Login</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className={isLocked(user) ? 'um-locked-row' : ''}>
                      <td className="um-name">
                        {editingName === user.id ? (
                          <span className="um-inline-edit">
                            <input
                              className="um-inline-input"
                              type="text"
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleNameSave(user.id);
                                if (e.key === 'Escape') setEditingName(null);
                              }}
                              autoFocus
                            />
                            <button
                              className="um-action-btn um-save-btn"
                              onClick={() => handleNameSave(user.id)}
                            >
                              Save
                            </button>
                            <button
                              className="um-action-btn um-cancel-btn"
                              onClick={() => setEditingName(null)}
                            >
                              {'\u00D7'}
                            </button>
                          </span>
                        ) : (
                          <span
                            className="um-editable"
                            onClick={() => {
                              setEditingName(user.id);
                              setEditNameValue(user.name);
                            }}
                            title="Click to edit"
                          >
                            {user.name}
                          </span>
                        )}
                      </td>
                      <td className="um-email">{user.email}</td>
                      <td>
                        <select
                          className={`um-role-select ${user.role === 'admin' ? 'um-role-admin' : ''}`}
                          value={user.role}
                          onChange={(e) => handlePatchUser(user.id, { role: e.target.value })}
                          disabled={user.id === currentUserId}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td>
                        {editingPassword === user.id ? (
                          <span className="um-inline-edit">
                            <input
                              className="um-inline-input um-password-input"
                              type="password"
                              placeholder="New password"
                              value={editPasswordValue}
                              onChange={(e) => setEditPasswordValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handlePasswordSave(user.id);
                                if (e.key === 'Escape') {
                                  setEditingPassword(null);
                                  setEditPasswordValue('');
                                }
                              }}
                              autoFocus
                            />
                            <button
                              className="um-action-btn um-save-btn"
                              onClick={() => handlePasswordSave(user.id)}
                            >
                              Save
                            </button>
                            <button
                              className="um-action-btn um-cancel-btn"
                              onClick={() => {
                                setEditingPassword(null);
                                setEditPasswordValue('');
                              }}
                            >
                              {'\u00D7'}
                            </button>
                          </span>
                        ) : (
                          <button
                            className="um-action-btn um-change-pw-btn"
                            onClick={() => {
                              setEditingPassword(user.id);
                              setEditPasswordValue('');
                            }}
                          >
                            Change
                          </button>
                        )}
                      </td>
                      <td className="um-auth-method">{getAuthMethod(user)}</td>
                      <td className="um-last-login" title={user.lastLogin || 'Never'}>
                        {formatRelativeTime(user.lastLogin)}
                      </td>
                      <td>
                        {isLocked(user) ? (
                          <span className="um-status-locked">Locked</span>
                        ) : user.failedLoginAttempts > 0 ? (
                          <span className="um-status-warning">{user.failedLoginAttempts} fails</span>
                        ) : (
                          <span className="um-status-active">Active</span>
                        )}
                      </td>
                      <td className="um-actions">
                        {isLocked(user) && (
                          <button
                            className="um-action-btn um-unlock-btn"
                            onClick={() => handleUnlock(user.id)}
                            title="Unlock account"
                          >
                            Unlock
                          </button>
                        )}
                        {user.id !== currentUserId && (
                          deleteConfirm === user.id ? (
                            <span className="um-confirm-delete">
                              <button
                                className="um-action-btn um-delete-confirm-btn"
                                onClick={() => handleDelete(user.id)}
                              >
                                Confirm
                              </button>
                              <button
                                className="um-action-btn um-cancel-btn"
                                onClick={() => setDeleteConfirm(null)}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              className="um-action-btn um-delete-btn"
                              onClick={() => setDeleteConfirm(user.id)}
                              title="Delete user"
                            >
                              Delete
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
