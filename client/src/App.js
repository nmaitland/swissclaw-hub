import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [kanban, setKanban] = useState(null);
  const messagesEndRef = useRef(null);

  // Connect to WebSocket
  useEffect(() => {
    const newSocket = io(API_URL || window.location.origin);
    setSocket(newSocket);

    newSocket.on('message', (msg) => {
      setMessages((prev) => [msg, ...prev]);
    });

    newSocket.on('activity', (activity) => {
      fetchStatus();
    });

    return () => newSocket.close();
  }, []);

  // Fetch all data
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

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tasks`);
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  const fetchKanban = async () => {
    try {
      const res = await fetch(`${API_URL}/api/kanban`);
      const data = await res.json();
      setKanban(data);
    } catch (err) {
      console.error('Failed to fetch kanban:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchTasks();
    fetchKanban();
    const interval = setInterval(() => {
      fetchStatus();
      fetchTasks();
      fetchKanban();
    }, 30000);
    return () => clearInterval(interval);
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

  const renderDashboard = () => (
    <div className="dashboard-content">
      <section className="status-section">
        <h2>Current Status</h2>
        {status?.swissclaw && (
          <div className="status-card">
            <div className="status-header">
              <div className="status-dot" style={{ background: getStatusColor(status.swissclaw.state) }} />
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
    </div>
  );

  const renderKanban = () => (
    <div className="kanban-content">
      <h2>🦀 Swissclaw's Kanban Board</h2>
      {kanban ? (
        <div className="kanban-board">
          <div className="kanban-column">
            <h3>📋 To Do</h3>
            <div className="kanban-tasks">
              {kanban.todo?.map((task) => (
                <div key={task.id} className="kanban-task">
                  <div className="task-title">{task.title}</div>
                  <div className="task-desc">{task.description}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="kanban-column">
            <h3>🚀 In Progress</h3>
            <div className="kanban-tasks">
              {kanban.inProgress?.map((task) => (
                <div key={task.id} className="kanban-task">
                  <div className="task-title">{task.title}</div>
                  <div className="task-desc">{task.description}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="kanban-column">
            <h3>✅ Done</h3>
            <div className="kanban-tasks">
              {kanban.done?.map((task) => (
                <div key={task.id} className="kanban-task">
                  <div className="task-title">{task.title}</div>
                  <div className="task-desc">{task.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="loading">Loading kanban...</div>
      )}
    </div>
  );

  const renderTasks = () => (
    <div className="tasks-content">
      <h2>👤 Neil's Action Items</h2>
      {tasks.length > 0 ? (
        <div className="tasks-list">
          {tasks.filter(t => !t.completed).map((task) => (
            <div key={task.id} className={`task-item priority-${task.priority}`}>
              <div className="task-checkbox">
                <input type="checkbox" checked={task.completed} readOnly />
              </div>
              <div className="task-content">
                <div className="task-title">{task.title}</div>
                <div className="task-desc">{task.description}</div>
                {task.dueDate && (
                  <div className="task-due">Due: {new Date(task.dueDate).toLocaleDateString()}</div>
                )}
              </div>
              <div className={`task-priority priority-${task.priority}`}>
                {task.priority}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-tasks">No pending action items!</div>
      )}
    </div>
  );

  const renderChat = () => (
    <div className="chat-content">
      <h2>Chat</h2>
      <div className="chat-container">
        <div className="messages">
          {messages.length === 0 ? (
            <div className="no-messages">No messages yet. Start a conversation!</div>
          ) : (
            [...messages].reverse().map((msg) => (
              <div key={msg.id} className={`message ${msg.sender === 'Neil' ? 'message-neil' : 'message-swissclaw'}`}>
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
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <h1>🦀 Swissclaw Hub</h1>
        <div className="connection-status">
          <span className="indicator" style={{ background: socket?.connected ? '#4ade80' : '#ef4444' }} />
          {socket?.connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <nav className="nav-tabs">
        <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
          📊 Dashboard
        </button>
        <button className={activeTab === 'kanban' ? 'active' : ''} onClick={() => setActiveTab('kanban')}>
          🦀 Kanban
        </button>
        <button className={activeTab === 'tasks' ? 'active' : ''} onClick={() => setActiveTab('tasks')}>
          👤 Tasks
        </button>
        <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
          💬 Chat
        </button>
      </nav>

      <main className="main">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'kanban' && renderKanban()}
        {activeTab === 'tasks' && renderTasks()}
        {activeTab === 'chat' && renderChat()}
      </main>

      <footer className="footer">
        <p>Swissclaw Hub v2.0 — Built with 🦀</p>
      </footer>
    </div>
  );
}

export default App;
