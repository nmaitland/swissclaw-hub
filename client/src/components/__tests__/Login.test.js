import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../Login';

describe('Login component', () => {
  const mockOnLogin = jest.fn();

  beforeEach(() => {
    mockOnLogin.mockClear();
  });

  it('renders the login form', () => {
    render(<Login onLogin={mockOnLogin} loading={false} error={null} />);

    expect(screen.getByText('Swissclaw Hub')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('calls onLogin with email and password on submit', async () => {
    const user = userEvent.setup();
    render(<Login onLogin={mockOnLogin} loading={false} error={null} />);

    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /login/i }));

    expect(mockOnLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('disables inputs and button when loading', () => {
    render(<Login onLogin={mockOnLogin} loading={true} error={null} />);

    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent('Logging in...');
  });

  it('displays error message when error prop is set', () => {
    render(<Login onLogin={mockOnLogin} loading={false} error="Invalid credentials" />);

    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('does not display error when error is null', () => {
    render(<Login onLogin={mockOnLogin} loading={false} error={null} />);

    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it('shows Login button text when not loading', () => {
    render(<Login onLogin={mockOnLogin} loading={false} error={null} />);

    expect(screen.getByRole('button')).toHaveTextContent('Login');
  });
});
