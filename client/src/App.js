import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || '';

// Get auth token from localStorage or URL
const getAuthToken = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  if (urlToken) {
    localStorage.setItem('authToken', urlToken);
    window.history.replaceState({}, '', window.location.pathname);
    return urlToken;
  }
  return localStorage.getItem('authToken');
};

function App() {
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [kanban, setKanban] = useState(null);
  const [activities, setActivities] = useState([]);
  const [buildInfo, setBuildInfo] = useState({ version: '2.1.0', commit: 'unknown' });
  const messagesEndRef = useRef(null);

  // Check auth on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token && window.location.pathname !== '/login') {
      window.location.href = '/login';
      return;
    }
  }, []);

  useEffect(() => {
    const newSocket = io(API_URL || window.location.origin, {
      auth: { token: getAuthToken() }
    });
    setSocket(newSocket);

    newSocket.on('message', (msg) => {
      setMessages((prev) => [msg, ...prev]);
    });

    newSocket.on('activity', (activity) => {
      setActivities(prev => [activity, ...prev].slice(0, 50));
      fetchData();
    });

    return () => newSocket.close();
  }, []);

  const fetchData = async () => {
    const token = getAuthToken();
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const [statusRes, tasksRes, kanbanRes] = await Promise.all([
        fetch(`${API_URL}/api/status`, { headers }),
        fetch(`${API_URL}/api/tasks`, { headers }),
        fetch(`${API_URL}/api/kanban`, { headers })
      ]);
      
      if (statusRes.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
        return;
      }
      
      const statusData = await statusRes.json();
      const tasksData = await tasksRes.json();
      const kanbanData = await kanbanRes.json();
      
      setStatus(statusData);
      if (statusData.recentMessages) {
        setMessages(statusData.recentMessages);
      }
      setTasks(tasksData);
      setKanban(kanbanData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch build info
  useEffect(() => {
    const fetchBuildInfo = async () => {
      try {
        const res = await fetch(`${API_URL}/api/build`);
        if (res.ok) {
          const data = await res.json();
          setBuildInfo(data);
        }
      } catch (err) {
        console.error('Failed to fetch build info:', err);
      }
    };
    fetchBuildInfo();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !socket) return;

    socket.emit('message', {
      sender: 'Neil',
      content: inputMessage.trim()
    });

    setInputMessage('');
  };

  const getStatusColor = (state) => {
    switch (state) {
      case 'active': return '#4ade80';
      case 'busy': return '#fbbf24';
      case 'idle': return '#9ca3af';
      default: return '#9ca3af';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#fbbf24';
      case 'low': return '#4ade80';
      default: return '#9ca3af';
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🦀 Swissclaw Hub</h1>
        <div className="header-status">
          <span className="indicator" style={{ background: socket?.connected ? '#4ade80' : '#ef4444' }} />
          <span className="version">v2.0</span>
        </div>
      </header>

      <main className="main unified">
        {/* Top Section: Status & Quick Overview */}
        <section className="overview-section">
          <div className="status-card main-status">
            <div className="status-header">
              <div className="status-dot" style={{ background: getStatusColor(status?.swissclaw?.state || 'idle') }} />
              <span className="status-state">{status?.swissclaw?.state || 'idle'}</span>
            </div>
            <div className="current-task">
              {status?.swissclaw?.currentTask || 'Ready to help'}
            </div>
            <div className="last-active">
              Updated: {status?.swissclaw?.lastActive ? new Date(status.swissclaw.lastActive).toLocaleTimeString() : '—'}
            </div>
          </div>

          {/* Stats Overview */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{kanban?.todo?.length || 0}</div>
              <div className="stat-label">To Do</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{kanban?.inProgress?.length || 0}</div>
              <div className="stat-label">In Progress</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{tasks?.filter(t => !t.completed).length || 0}</div>
              <div className="stat-label">Your Tasks</div>
            </div>
            <div className="stat-card chat-stat" onClick={() => setShowChat(!showChat)}>
              <div className="stat-value">{messages.length}</div>
              <div className="stat-label">{showChat ? 'Hide Chat' : 'Show Chat'}</div>
            </div>
          </div>
        </section>

        {/* Middle Section: Kanban Summary & Tasks */}
        <div className="content-grid">
          {/* Kanban Summary */}
          <section className="kanban-summary">
            <h2>🦀 My Kanban</h2>
            
            {kanban?.inProgress?.length > 0 && (
              <div className="kanban-section">
                <h3>🚀 In Progress</h3>
                <div className="task-list compact">
                  {kanban.inProgress.slice(0, 3).map(task => (
                    <div key={task.id} className="task-row">
                      <span className="task-title">{task.title}</span>
                      <span className="task-desc">{task.description?.substring(0, 60)}...</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {kanban?.todo?.length > 0 && (
              <div className="kanban-section">
                <h3>📋 Next Up</h3>
                <div className="task-list compact">
                  {kanban.todo.slice(0, 2).map(task => (
                    <div key={task.id} className="task-row">
                      <span className="task-title">{task.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {kanban?.done?.slice(0, 3).length > 0 && (
              <div className="kanban-section done-section">
                <h3>✅ Recently Done</h3>
                <div className="task-list compact">
                  {kanban.done.slice(0, 3).map(task => (
                    <div key={task.id} className="task-row done">
                      <span className="task-title">{task.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Neil's Tasks */}
          <section className="tasks-section">
            <h2>👤 Your Action Items</h2>
            {tasks.filter(t => !t.completed).length === 0 ? (
              <div className="no-tasks">No pending tasks!</div>
            ) : (
              <div className="task-list">
                {tasks.filter(t => !t.completed).slice(0, 5).map(task => (
                  <div key={task.id} className={`task-item priority-${task.priority}`}>
                    <div className="task-checkbox">
                      <input type="checkbox" checked={task.completed} readOnly />
                    </div>
                    <div className="task-content">
                      <div className="task-title">{task.title}</div>
                      {task.description && (
                        <div className="task-desc">{task.description}</div>
                      )}
                    </div>
                    <div className="task-priority" style={{ background: getPriorityColor(task.priority) }}>
                      {task.priority}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Bottom Panels: Activity Feed & Chat side by side */}
        <div className="bottom-panels">
          {/* Activity Feed */}
          <section className="panel activity-panel">
            <h2>🔍 Live Activity</h2>
            <div className="panel-content activity-feed">
              {activities.length === 0 ? (
                <div className="empty-state">No recent activity</div>
              ) : (
                activities.map((activity, i) => (
                  <div key={i} className="activity-item">
                    <span className="activity-time">{new Date(activity.timestamp).toLocaleTimeString()}</span>
                    <span className="activity-text">{activity.description}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Chat */}
          <section className="panel chat-panel">
            <h2>💬 Chat</h2>
            <div className="panel-content chat-messages">
              {messages.length === 0 ? (
                <div className="empty-state">No messages yet</div>
              ) : (
                [...messages].reverse().map((msg) => (
                  <div key={msg.id} className={`chat-message ${msg.sender === 'Neil' ? 'chat-neil' : 'chat-swissclaw'}`}>
                    <span className="chat-sender">{msg.sender}</span>
                    <span className="chat-text">{msg.content}</span>
                    <span className="chat-time">{new Date(msg.created_at).toLocaleTimeString()}</span>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <form className="chat-input" onSubmit={sendMessage}>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
                disabled={!socket?.connected}
              />
              <button type="submit" disabled={!socket?.connected || !inputMessage.trim()}>
                Send
              </button>
            </form>
          </section>
        </div>
      </main>

      <footer className="footer">
        <p>
          Swissclaw Hub v{buildInfo.version} — Built with 🦀 —{' '}
          <a href={`https://github.com/nmaitland/swissclaw-hub/commit/${buildInfo.commit}`} target="_blank" rel="noopener noreferrer">
            {buildInfo.commit}
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;