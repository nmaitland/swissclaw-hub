import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const messagesEndRef = useRef(null);

  // Connect to WebSocket
  useEffect(() => {
    const newSocket = io(API_URL || window.location.origin);
    setSocket(newSocket);

    newSocket.on('message', (msg) => {
      setMessages((prev) => [msg, ...prev]);
    });

    newSocket.on('activity', (activity) => {
      // Refresh status when new activity comes in
      fetchStatus();
    });

    return () => newSocket.close();
  }, []);

  // Fetch initial status and messages
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/status`);
      const data = await res.json();
      setStatus(data);
      if (data.recentMessages) {
        setMessages(data.recentMessages);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom of messages
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

  return (
    <div className="app">
      <header className="header">
        <h1>🦀 Swissclaw Hub</h1>
        <div className="connection-status">
          <span className="indicator" style={{ 
            background: socket?.connected ? '#4ade80' : '#ef4444' 
          }} />
          {socket?.connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <main className="main">
        {/* Status Dashboard */}
        <section className="status-section">
          <h2>Current Status</h2>
          {status?.swissclaw && (
            <div className="status-card">
              <div className="status-header">
                <div 
                  className="status-dot"
                  style={{ background: getStatusColor(status.swissclaw.state) }}
                />
                <span className="status-state">{status.swissclaw.state}</span>
              </div>
              <div className="current-task">
                <strong>Currently:</strong> {status.swissclaw.currentTask}
              </div>
              <div className="last-active">
                Last active: {new Date(status.swissclaw.lastActive).toLocaleString()}
              </div>
            </div>
          )}

          {/* Recent Activities */}
          {status?.recentActivities && status.recentActivities.length > 0 && (
            <div className="activities">
              <h3>Recent Activity</h3>
              <ul className="activity-list">
                {status.recentActivities.slice(0, 5).map((activity) => (
                  <li key={activity.id} className="activity-item">
                    <span className="activity-type">{activity.type}</span>
                    <span className="activity-desc">{activity.description}</span>
                    <span className="activity-time">
                      {new Date(activity.created_at).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Chat Window */}
        <section className="chat-section">
          <h2>Chat</h2>
          <div className="chat-container">
            <div className="messages">
              {messages.length === 0 ? (
                <div className="no-messages">No messages yet. Start a conversation!</div>
              ) : (
                [...messages].reverse().map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`message ${msg.sender === 'Neil' ? 'message-neil' : 'message-swissclaw'}`}
                  >
                    <div className="message-header">
                      <span className="message-sender">{msg.sender}</span>
                      <span className="message-time">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="message-content">{msg.content}</div>
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
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>Swissclaw Hub v1.0 — Built with 🦀</p>
      </footer>
    </div>
  );
}

export default App;
