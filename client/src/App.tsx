import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  User,
  Status,
  KanbanTask,
  Message,
  Activity,
  HealthCheck
} from './types';

// Components
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface AppState {
  user: User | null;
  token: string | null;
  status: Status[];
  messages: Message[];
  kanban: KanbanTask[];
  activities: Activity[];
  health: HealthCheck | null;
  socket: Socket | null;
  loading: boolean;
  error: string | null;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    user: null,
    token: localStorage.getItem('token'),
    status: [],
    messages: [],
    kanban: [],
    activities: [],
    health: null,
    socket: null,
    loading: false,
    error: null,
  });

  const setStateProperty = useCallback(<K extends keyof AppState>(
    property: K,
    value: AppState[K]
  ) => {
    setState(prev => ({ ...prev, [property]: value }));
  }, []);

  // Initialize socket connection
  const initializeSocket = useCallback((token: string, user: User) => {
    const socket = io(API_BASE_URL, {
      auth: { token }
    });

    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    socket.on('newMessage', (message: Message) => {
      setState(prev => ({
        ...prev,
        messages: [message, ...prev.messages]
      }));
    });

    socket.on('statusUpdate', (statusUpdate: Status) => {
      setState(prev => ({
        ...prev,
        status: [statusUpdate, ...prev.status]
      }));
    });

    socket.on('kanbanUpdate', (update: { type: string; task?: KanbanTask; taskId?: string }) => {
      setState(prev => {
        let newKanban = [...prev.kanban];
        
        if (update.type === 'created' && update.task) {
          newKanban = [update.task, ...newKanban];
        } else if (update.type === 'updated' && update.task) {
          newKanban = newKanban.map(task => 
            task.id === update.task!.id ? update.task! : task
          );
        } else if (update.type === 'deleted' && update.taskId) {
          newKanban = newKanban.filter(task => task.id !== update.taskId);
        }
        
        return { ...prev, kanban: newKanban };
      });
    });

    socket.on('userCount', (count: number) => {
      console.log('Active users:', count);
    });

    socket.on('error', (error: { message: string }) => {
      setStateProperty('error', error.message);
    });

    setStateProperty('socket', socket);
  }, [setStateProperty]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    if (!state.token) return;

    setStateProperty('loading', true);
    setStateProperty('error', null);

    try {
      const headers = {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json',
      };

      const [statusRes, messagesRes, kanbanRes, activitiesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/status`, { headers }),
        fetch(`${API_BASE_URL}/api/messages`, { headers }),
        fetch(`${API_BASE_URL}/api/kanban`, { headers }),
        fetch(`${API_BASE_URL}/api/activities`, { headers }),
      ]);

      if (!statusRes.ok || !messagesRes.ok || !kanbanRes.ok || !activitiesRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const [statusData, messagesData, kanbanData, activitiesData] = await Promise.all([
        statusRes.json(),
        messagesRes.json(),
        kanbanRes.json(),
        activitiesRes.json(),
      ]);

      setState(prev => ({
        ...prev,
        status: statusData,
        messages: messagesData,
        kanban: kanbanData,
        activities: activitiesData,
        loading: false,
      }));
    } catch (error) {
      setStateProperty('error', (error as Error).message);
      setStateProperty('loading', false);
    }
  }, [state.token, setStateProperty]);

  // Check health
  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const healthData = await response.json();
      setStateProperty('health', healthData);
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }, [setStateProperty]);

  // Handle login
  const handleLogin = useCallback(async (email: string, password: string) => {
    setStateProperty('loading', true);
    setStateProperty('error', null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();
      
      localStorage.setItem('token', data.token);
      setStateProperty('token', data.token);
      setStateProperty('user', data.user);
      setStateProperty('loading', false);

      initializeSocket(data.token, data.user);
    } catch (error) {
      setStateProperty('error', (error as Error).message);
      setStateProperty('loading', false);
    }
  }, [setStateProperty, initializeSocket]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    if (state.token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${state.token}`,
          },
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    localStorage.removeItem('token');
    
    if (state.socket) {
      state.socket.disconnect();
    }

    setStateProperty('token', null);
    setStateProperty('user', null);
    setStateProperty('socket', null);
    setStateProperty('status', []);
    setStateProperty('messages', []);
    setStateProperty('kanban', []);
    setStateProperty('activities', []);
  }, [state.token, state.socket, setStateProperty]);

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!state.token) return;

      try {
        const response = await fetch(`${API_BASE_URL}/auth/validate`, {
          headers: {
            'Authorization': `Bearer ${state.token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Invalid token');
        }

        const data = await response.json();
        setStateProperty('user', data.user);
        initializeSocket(state.token, data.user);
      } catch (error) {
        console.error('Token validation failed:', error);
        handleLogout();
      }
    };

    validateToken();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch data when user is authenticated
  useEffect(() => {
    if (state.user && state.token) {
      fetchData();
    }
  }, [state.user, state.token, fetchData]);

  // Periodic health check
  useEffect(() => {
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    checkHealth(); // Initial check

    return () => clearInterval(interval);
  }, [checkHealth]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.socket) {
        state.socket.disconnect();
      }
    };
  }, [state.socket]);

  if (!state.token || !state.user) {
    return (
      <div className="App">
        <Login
          onLogin={handleLogin}
          loading={state.loading}
          error={state.error}
        />
      </div>
    );
  }

  return (
    <div className="App">
      <Dashboard
        user={state.user}
        status={state.status}
        messages={state.messages}
        kanban={state.kanban}
        activities={state.activities}
        health={state.health}
        socket={state.socket}
        loading={state.loading}
        error={state.error}
        onLogout={handleLogout}
        token={state.token}
      />
    </div>
  );
};

export default App;
