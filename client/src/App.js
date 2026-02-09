import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import KanbanBoard from './components/KanbanBoard';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || '';

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
      const [statusRes, kanbanRes] = await Promise.all([
        fetch(`${API_URL}/api/status`, { headers }),
        fetch(`${API_URL}/api/kanban`, { headers })
      ]);
      
      if (statusRes.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
        return;
      }
      
      const statusData = await statusRes.json();
      const kanbanData = await kanbanRes.json();
      
      setStatus(statusData);
      if (statusData.recentMessages) {
        setMessages(statusData.recentMessages);
      }
      setKanban(kanbanData);
      setActivities(statusData.recentActivities || []);
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

  // Calculate kanban stats
  const getKanbanCounts = () => {
    if (!kanban || !kanban.tasks) return { todo: 0, inProgress: 0, review: 0, total: 0 };
    return {
      todo: kanban.tasks.todo?.length || 0,
      inProgress: kanban.tasks.inProgress?.length || 0,
      review: kanban.tasks.review?.length || 0,
      total: Object.values(kanban.tasks).reduce((acc, col) => acc + (col?.length || 0), 0)
    };
  };

  const kanbanCounts = getKanbanCounts();

  return (
    <div className="app">
      <header className="header">
        <h1>🦀 Swissclaw Hub</h1>
        <div className="header-status">
          <span className="indicator" style={{ background: socket?.connected ? '#4ade80' : '#ef4444' }} />
          <span className="version">v{buildInfo.version}</span>
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
              <div className="stat-value">{kanbanCounts.todo}</div>
              <div className="stat-label">To Do</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{kanbanCounts.inProgress}</div>
              <div className="stat-label">In Progress</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{kanbanCounts.review}</div>
              <div className="stat-label">Review</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{kanbanCounts.total}</div>
              <div className="stat-label">Total Tasks</div>
            </div>
          </div>
        </section>

        {/* Unified Kanban Board - replaces the 3 separate sections */}
        <KanbanBoard />

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
                    <span className="activity-time">{new Date(activity.created_at || activity.timestamp).toLocaleTimeString()}</span>
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
