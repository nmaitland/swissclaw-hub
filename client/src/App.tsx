import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import KanbanBoard from './components/KanbanBoard';
import type {
  Activity,
  ChatMessage,
  BuildInfo,
  StatusResponse,
  MessageProcessingState,
  MessageStateUpdate,
  ModelUsageCostType
} from './types';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || '';

const getAuthToken = (): string | null => {
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
  const hasInitiallyScrolled = useRef(false);
  const pendingMessagesRef = useRef<Array<{ sender: string; content: string }>>([]);

  // Activities pagination state
  const [hasMoreActivities, setHasMoreActivities] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const activityObserverRef = useRef<IntersectionObserver | null>(null);
  const activityLoadMoreRef = useRef<HTMLDivElement>(null);
  const activityFeedRef = useRef<HTMLDivElement>(null);

  // Message processing states
  const [messageStates, setMessageStates] = useState<Record<string, MessageProcessingState>>({});

  // Check auth on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token && window.location.pathname !== '/login') {
      window.location.assign('/login');
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
      // Scroll to top to show latest activity
      setTimeout(() => {
        activityFeedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
    });

    newSocket.on('status-update', (update: { state: string; currentTask: string; lastActive: string }) => {
      setStatus((prev) => prev ? {
        ...prev,
        state: update.state as 'active' | 'busy' | 'idle',
        currentTask: update.currentTask,
        lastActive: update.lastActive
      } : null);
    });

    newSocket.on('message-state', ({ messageId, state }: MessageStateUpdate) => {
      setMessageStates((prev) => ({ ...prev, [messageId]: state }));
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
        window.location.assign('/login');
        return;
      }

      const statusData: StatusResponse = await statusRes.json();
      setStatus(statusData);

      const messagesRes = await fetch(`${API_URL}/api/messages?limit=50`, { headers });
      if (messagesRes.ok) {
        const messageData: ChatMessage[] = await messagesRes.json();
        setMessages((prev) => {
          const next = messageData;
          if (
            prev.length === next.length &&
            prev.every((msg, idx) =>
              msg.id === next[idx]?.id &&
              msg.sender === next[idx]?.sender &&
              msg.content === next[idx]?.content &&
              msg.created_at === next[idx]?.created_at
            )
          ) {
            return prev;
          }
          return next;
        });
      }
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
    fetchActivities();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Always scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({
        behavior: hasInitiallyScrolled.current ? 'smooth' : 'auto'
      });
      hasInitiallyScrolled.current = true;
    }
  }, [messages]);

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

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    sendCurrentMessage();
  };

  const sendCurrentMessage = () => {
    if (!inputMessage.trim()) return;

    const msg = { sender: 'operator', content: inputMessage.trim() };

    if (socket?.connected) {
      socket.emit('message', msg);
    } else {
      // Queue message to send when connected
      pendingMessagesRef.current.push(msg);
    }

    setInputMessage('');
  };

  const handleChatInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCurrentMessage();
    }
  };

  const getCostAmount = (costs: Array<{ type: ModelUsageCostType; amount: number }>, type: ModelUsageCostType): number => {
    return costs.find((entry) => entry.type === type)?.amount || 0;
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
                  {status?.state === 'active' && '\u{1F980}'}
                  {status?.state === 'busy' && '\u{1F980}'}
                  {status?.state === 'idle' && '\u{1F980}'}
                  {!status?.state && '\u{1F980}'}
                </span>
                <span className="status-state">{status?.state || 'idle'}</span>
              </div>
              <div className="current-task">
                {status?.currentTask || 'Ready to help'}
              </div>
              <div className="status-stats">
                <div className="stat-row">
                  <span className="stat-label">Activities today:</span>
                  <span className="stat-value">{status?.activityCount ?? 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Chats today:</span>
                  <span className="stat-value">{status?.chatCount ?? 0}</span>
                </div>
                {status?.modelUsage && (
                  <>
                    <div className="stat-row">
                      <span className="stat-label">Model usage:</span>
                      <span className="stat-value">
                        {status.modelUsage.totals.inputTokens.toLocaleString()} in / {status.modelUsage.totals.outputTokens.toLocaleString()} out
                        {' '}({status.modelUsage.totals.totalTokens.toLocaleString()} total)
                      </span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Requests:</span>
                      <span className="stat-value">{status.modelUsage.totals.requestCount.toLocaleString()}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Cost (paid):</span>
                      <span className="stat-value">${getCostAmount(status.modelUsage.totals.costs, 'paid').toFixed(4)}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Cost (free potential):</span>
                      <span className="stat-value">${getCostAmount(status.modelUsage.totals.costs, 'free_tier_potential').toFixed(4)}</span>
                    </div>
                    {status.modelUsage.models.length > 0 && (
                      <div className="model-breakdown">
                        {status.modelUsage.models.map((entry) => (
                          <div key={entry.model} className="model-entry">
                            <span className="model-name">{entry.model}:</span>
                            <span className="model-stats">
                              {entry.inputTokens.toLocaleString()} in / {entry.outputTokens.toLocaleString()} out
                              {' '}({entry.requestCount.toLocaleString()} req)
                              {' '}paid ${getCostAmount(entry.costs, 'paid').toFixed(4)}
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
                {status?.lastActive
                  ? new Date(status.lastActive).toLocaleTimeString()
                  : '\u2014'}
              </div>
            </div>
          </section>

          {/* Activities Panel (moved to top) */}
          <section className="panel activity-panel">
            <h2>{'\u26A1'} Activities</h2>
            <div className="panel-content activity-feed" ref={activityFeedRef}>
              {activities.length === 0 ? (
                <div className="empty-state">No recent activity</div>
              ) : (
                <>
                  {activities.map((activity, i) => {
                    const activityId = String(activity.id || `${activity.created_at}-${i}`);
                    const isExpanded = expandedActivityId === activityId;
                    const activitySender = activity.sender || (
                      typeof activity.metadata?.sender === 'string' ? activity.metadata.sender : null
                    );
                    const activityDetails = (
                      activitySender && activity.description.startsWith(`${activitySender}: `)
                        ? activity.description.slice(activitySender.length + 2)
                        : activity.description
                    );

                    return (
                      <div
                        key={activityId}
                        className={`activity-item ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => setExpandedActivityId(isExpanded ? null : activityId)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedActivityId(isExpanded ? null : activityId);
                          }
                        }}
                      >
                        <span className="activity-time">
                          {new Date(activity.created_at || (activity as any).timestamp).toLocaleTimeString()}
                        </span>
                        <span className="activity-text">{activityDetails}</span>

                        {isExpanded && (
                          <div className="activity-inline-details">
                            <div className="detail-row">
                              <span className="detail-label">Type:</span>
                              <span className="detail-value">{activity.type || 'N/A'}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Sender:</span>
                              <span className="detail-value">{activitySender || 'N/A'}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Time:</span>
                              <span className="detail-value">
                                {new Date(activity.created_at).toLocaleString()}
                              </span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Details:</span>
                              <p className="detail-description">{activityDetails}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  className={`chat-message ${msg.sender === 'operator' ? 'chat-operator' : 'chat-swissclaw'}`}
                >
                  <div className="chat-message-header">
                    <span className="chat-sender">
                      {msg.sender}
                      {msg.sender === 'operator' && messageStates[msg.id] && messageStates[msg.id] !== 'responded' && (
                        <span className={`message-state message-state-${messageStates[msg.id]}`}>
                          {messageStates[msg.id] === 'received' && ' âœ“'}
                          {messageStates[msg.id] === 'processing' && ' âš™ï¸'}
                          {messageStates[msg.id] === 'thinking' && ' ...'}
                        </span>
                      )}
                    </span>
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
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleChatInputKeyDown}
              placeholder={socketConnected ? 'Type a message...' : 'Connecting...'}
              rows={1}
            />
            <button type="submit" disabled={!inputMessage.trim()}>
              Send
            </button>
          </form>
        </section>
      </main>

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

