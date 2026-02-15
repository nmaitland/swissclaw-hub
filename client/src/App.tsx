import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import KanbanBoard from './components/KanbanBoard';
import type { Activity, ChatMessage, BuildInfo, StatusResponse } from './types';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || '';

const getAuthToken = (): string | null => {
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
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [buildInfo, setBuildInfo] = useState<BuildInfo>({ version: '2.1.0', commit: 'unknown' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(false);

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
      auth: { token: getAuthToken() },
    });
    setSocket(newSocket);

    newSocket.on('message', (msg: ChatMessage) => {
      setMessages((prev) => [msg, ...prev]);
    });

    newSocket.on('activity', (activity: Activity) => {
      setActivities((prev) => [activity, ...prev].slice(0, 50));
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const fetchData = async () => {
    const token = getAuthToken();
    try {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const statusRes = await fetch(`${API_URL}/api/status`, { headers });

      if (statusRes.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
        return;
      }

      const statusData: StatusResponse = await statusRes.json();

      setStatus(statusData);
      if (statusData.recentMessages) {
        setMessages(statusData.recentMessages);
      }
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
          const data: BuildInfo = await res.json();
          setBuildInfo(data);
        }
      } catch (err) {
        console.error('Failed to fetch build info:', err);
      }
    };
    fetchBuildInfo();
  }, []);

  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      shouldAutoScroll.current = false;
    }
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !socket) return;

    shouldAutoScroll.current = true;
    socket.emit('message', {
      sender: 'Neil',
      content: inputMessage.trim(),
    });

    setInputMessage('');
  };

  const getStatusColor = (state: string): string => {
    switch (state) {
      case 'active':
        return '#4ade80';
      case 'busy':
        return '#fbbf24';
      case 'idle':
        return '#9ca3af';
      default:
        return '#9ca3af';
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>{'\u{1F980}'} Swissclaw Hub</h1>
        <div className="header-status">
          <span
            className="indicator"
            style={{ background: socket?.connected ? '#4ade80' : '#ef4444' }}
          />
          <span className="version">v{buildInfo.version}</span>
        </div>
      </header>

      <main className="main unified">
        {/* Top Section: Status + Chat side by side */}
        <section className="top-panels">
          <section className="panel status-panel">
            <h2>{'\u{1F4E1}'} Status</h2>
            <div className="panel-content status-content">
              <div className="status-header">
                <div
                  className="status-dot"
                  style={{ background: getStatusColor(status?.swissclaw?.state || 'idle') }}
                />
                <span className="status-state">{status?.swissclaw?.state || 'idle'}</span>
              </div>
              <div className="current-task">
                {status?.swissclaw?.currentTask || 'Ready to help'}
              </div>
              <div className="last-active">
                Updated:{' '}
                {status?.swissclaw?.lastActive
                  ? new Date(status.swissclaw.lastActive).toLocaleTimeString()
                  : '\u2014'}
              </div>
            </div>
          </section>

          <section className="panel chat-panel">
            <h2>{'\u{1F4AC}'} Chat</h2>
            <div className="panel-content chat-messages">
              {messages.length === 0 ? (
                <div className="empty-state">No messages yet</div>
              ) : (
                [...messages].reverse().map((msg) => (
                  <div
                    key={msg.id}
                    className={`chat-message ${msg.sender === 'Neil' ? 'chat-neil' : 'chat-swissclaw'}`}
                  >
                    <div className="chat-message-header">
                      <span className="chat-sender">{msg.sender}</span>
                      <span className="chat-time">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className="chat-text">{msg.content}</span>
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
        </section>

        {/* Unified Kanban Board */}
        <KanbanBoard />

        {/* Activity Feed */}
        <section className="panel activity-panel">
          <h2>{'\u26A1'} Live Activity</h2>
          <div className="panel-content activity-feed">
            {activities.length === 0 ? (
              <div className="empty-state">No recent activity</div>
            ) : (
              activities.map((activity, i) => (
                <div key={i} className="activity-item">
                  <span className="activity-time">
                    {new Date(activity.created_at || (activity as any).timestamp).toLocaleTimeString()}
                  </span>
                  <span className="activity-text">{activity.description}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>
          Swissclaw Hub v{buildInfo.version} {'\u2014'} Built with {'\u{1F980}'} {'\u2014'}{' '}
          <a
            href={`https://github.com/nmaitland/swissclaw-hub/commit/${buildInfo.commit}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {buildInfo.commit}
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
