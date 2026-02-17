import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import KanbanBoard from './components/KanbanBoard';
import type { Activity, ChatMessage, BuildInfo, StatusResponse } from './types';
import './App.css';

// Activity Detail Modal Component
interface ActivityDetailModalProps {
  activity: Activity | null;
  onClose: () => void;
}

function ActivityDetailModal({ activity, onClose }: ActivityDetailModalProps) {
  if (!activity) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Activity Details</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="detail-row">
            <span className="detail-label">Type:</span>
            <span className="detail-value">{activity.type || 'N/A'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Time:</span>
            <span className="detail-value">
              {new Date(activity.created_at).toLocaleString()}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Description:</span>
            <p className="detail-description">{activity.description}</p>
          </div>
          {activity.metadata && Object.keys(activity.metadata).length > 0 && (
            <div className="detail-row">
              <span className="detail-label">Metadata:</span>
              <pre className="detail-metadata">
                {JSON.stringify(activity.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [socketConnected, setSocketConnected] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [buildInfo, setBuildInfo] = useState<BuildInfo>({ buildDate: new Date().toISOString(), commit: 'unknown' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(false);
  const hasInitiallyScrolled = useRef(false);
  const pendingMessagesRef = useRef<Array<{ sender: string; content: string }>>([]);

  // Activities pagination state
  const [hasMoreActivities, setHasMoreActivities] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const activityObserverRef = useRef<IntersectionObserver | null>(null);
  const activityLoadMoreRef = useRef<HTMLDivElement>(null);

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
      transports: ['websocket'],
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setSocketConnected(true);
      // Flush any messages queued while connecting
      while (pendingMessagesRef.current.length > 0) {
        const msg = pendingMessagesRef.current.shift();
        if (msg) newSocket.emit('message', msg);
      }
    });

    newSocket.on('disconnect', () => {
      setSocketConnected(false);
    });

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

  // Fetch activities with pagination
  const fetchActivities = useCallback(async (before?: string) => {
    if (isLoadingActivities) return;

    setIsLoadingActivities(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      let url = `${API_URL}/api/activities?limit=20`;
      if (before) {
        url += `&before=${encodeURIComponent(before)}`;
      }

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (before) {
          // Append to existing activities
          setActivities((prev) => [...prev, ...data.activities]);
        } else {
          // Replace activities (initial load)
          setActivities(data.activities);
        }
        setHasMoreActivities(data.hasMore);
      }
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    } finally {
      setIsLoadingActivities(false);
    }
  }, [isLoadingActivities]);

  // Setup IntersectionObserver for infinite scroll
  useEffect(() => {
    if (activityObserverRef.current) {
      activityObserverRef.current.disconnect();
    }

    activityObserverRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMoreActivities && !isLoadingActivities) {
          const oldestActivity = activities[activities.length - 1];
          if (oldestActivity?.created_at) {
            fetchActivities(oldestActivity.created_at);
          }
        }
      },
      { threshold: 0.5 }
    );

    if (activityLoadMoreRef.current) {
      activityObserverRef.current.observe(activityLoadMoreRef.current);
    }

    return () => {
      activityObserverRef.current?.disconnect();
    };
  }, [activities, hasMoreActivities, isLoadingActivities, fetchActivities]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom only on initial message load
  useEffect(() => {
    if (messages.length > 0 && !hasInitiallyScrolled.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      hasInitiallyScrolled.current = true;
    }
  }, [messages.length]);

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
    if (!inputMessage.trim()) return;

    const msg = { sender: 'Neil', content: inputMessage.trim() };

    if (socket?.connected) {
      shouldAutoScroll.current = true;
      socket.emit('message', msg);
    } else {
      // Queue message to send when connected
      pendingMessagesRef.current.push(msg);
    }

    setInputMessage('');
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
          <span className="version">{new Date(buildInfo.buildDate).toLocaleDateString()}</span>
        </div>
      </header>

      <main className="main unified">
        {/* Top Section: Status + Activities side by side */}
        <section className="top-panels">
          <section className="panel status-panel">
            <h2>{'\u{1F4E1}'} Status</h2>
            <div className="panel-content status-content">
              <div className="status-header">
                <span className="status-icon">
                  {status?.swissclaw?.state === 'active' && '\u{1F980}'}
                  {status?.swissclaw?.state === 'busy' && '\u{1F980}'}
                  {status?.swissclaw?.state === 'idle' && '\u{1F980}'}
                  {!status?.swissclaw?.state && '\u{1F980}'}
                </span>
                <span className="status-state">{status?.swissclaw?.state || 'idle'}</span>
              </div>
              <div className="current-task">
                {status?.swissclaw?.currentTask || 'Ready to help'}
              </div>
              <div className="status-stats">
                <div className="stat-row">
                  <span className="stat-label">Activities today:</span>
                  <span className="stat-value">{status?.activityCount ?? 0}</span>
                </div>
                {status?.modelUsage && (
                  <>
                    <div className="stat-row">
                      <span className="stat-label">Model usage:</span>
                      <span className="stat-value">
                        {status.modelUsage.total.inputTokens.toLocaleString()} in / {status.modelUsage.total.outputTokens.toLocaleString()} out
                        (${status.modelUsage.total.estimatedCost.toFixed(2)})
                      </span>
                    </div>
                    {status.modelUsage.byModel.length > 0 && (
                      <div className="model-breakdown">
                        {status.modelUsage.byModel.map((entry) => (
                          <div key={entry.model} className="model-entry">
                            <span className="model-name">{entry.model}:</span>
                            <span className="model-stats">
                              {entry.inputTokens.toLocaleString()} in / {entry.outputTokens.toLocaleString()} out
                              (${entry.estimatedCost.toFixed(2)})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="last-active">
                Updated:{' '}
                {status?.swissclaw?.lastActive
                  ? new Date(status.swissclaw.lastActive).toLocaleTimeString()
                  : '\u2014'}
              </div>
            </div>
          </section>

          {/* Activities Panel (moved to top) */}
          <section className="panel activity-panel">
            <h2>{'\u26A1'} Activities</h2>
            <div className="panel-content activity-feed">
              {activities.length === 0 ? (
                <div className="empty-state">No recent activity</div>
              ) : (
                <>
                  {activities.map((activity, i) => (
                    <div
                      key={i}
                      className="activity-item"
                      onClick={() => setSelectedActivity(activity)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedActivity(activity);
                        }
                      }}
                    >
                      <span className="activity-time">
                        {new Date(activity.created_at || (activity as any).timestamp).toLocaleTimeString()}
                      </span>
                      <span className="activity-text">{activity.description}</span>
                    </div>
                  ))}
                  {/* Infinite scroll sentinel */}
                  <div ref={activityLoadMoreRef} className="activity-load-more">
                    {isLoadingActivities && (
                      <div className="loading-indicator">Loading more...</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        </section>

        {/* Unified Kanban Board */}
        <KanbanBoard />

        {/* Chat Panel (moved to bottom) */}
        <section className="panel chat-panel">
          <h2>
            {'\u{1F4AC}'} Chat
            {!socketConnected && (
              <span className="chat-connecting"> connecting...</span>
            )}
          </h2>
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
              placeholder={socketConnected ? 'Type a message...' : 'Connecting...'}
            />
            <button type="submit" disabled={!inputMessage.trim()}>
              Send
            </button>
          </form>
        </section>
      </main>

      {/* Activity Detail Modal */}
      <ActivityDetailModal
        activity={selectedActivity}
        onClose={() => setSelectedActivity(null)}
      />

      <footer className="footer">
        <p>
          Swissclaw Hub {'\u2014'} Built: {new Date(buildInfo.buildDate).toLocaleString()} {'\u2014'} {'\u{1F980}'} {'\u2014'}{' '}
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
