import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import KanbanBoard from './components/KanbanBoard';
import UserManagement from './components/UserManagement';
import type {
  Activity,
  ChatMessage,
  BuildInfo,
  StatusResponse,
  MessageProcessingState,
  MessageStateUpdate,
  ModelUsageCostType,
  ModelUsageSnapshot,
  User,
} from './types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ReactMarkdown from 'react-markdown';
const Markdown = ReactMarkdown as React.FC<{ children: string }>;
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || '';
const MOBILE_VIEW_MODE_KEY = 'hub.mobileViewMode.v1';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type MobileViewMode = 'status' | 'activities' | 'kanban' | 'chat';
const MOBILE_VIEW_MODES: Array<{ key: MobileViewMode; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'activities', label: 'Activities' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'chat', label: 'Chat' },
];

const readPersistedMobileViewMode = (): MobileViewMode => {
  try {
    const raw = localStorage.getItem(MOBILE_VIEW_MODE_KEY);
    if (raw === 'status' || raw === 'activities' || raw === 'kanban' || raw === 'chat') {
      return raw;
    }
  } catch {
    // Ignore storage read failures and use defaults.
  }

  return 'status';
};

const getMobileLayoutMatches = (): boolean => {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 768px)').matches;
};

const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

const getStandaloneDisplayMode = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const nav = window.navigator as Navigator & { standalone?: boolean };
  const isIosStandalone = nav.standalone === true;
  const isStandaloneMatch = typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;

  return isIosStandalone || isStandaloneMatch;
};

const getActivitySender = (activity: Activity): string | null => {
  return activity.sender || (
    typeof activity.metadata?.sender === 'string' ? activity.metadata.sender : null
  );
};

const getActivitySenderVariant = (sender: string | null): 'swissclaw' | 'user' | 'system' => {
  if (!sender) {
    return 'system';
  }

  const normalizedSender = sender.trim().toLowerCase();
  if (normalizedSender === 'swissclaw' || normalizedSender === 'swiss claw') {
    return 'swissclaw';
  }

  return 'user';
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
  const chatMessagesRef = useRef<HTMLDivElement>(null);
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
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>(readPersistedMobileViewMode);
  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(getMobileLayoutMatches);
  const [isModelUsageModalOpen, setIsModelUsageModalOpen] = useState(false);
  const [usageHistory, setUsageHistory] = useState<ModelUsageSnapshot[] | null>(null);
  const [isLoadingUsageHistory, setIsLoadingUsageHistory] = useState(false);
  const [isTopPanelsCollapsed, setIsTopPanelsCollapsed] = useState(false);
  const [isKanbanCollapsedDesktop, setIsKanbanCollapsedDesktop] = useState(false);
  const [isChatCollapsedDesktop, setIsChatCollapsedDesktop] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallPromptVisible, setIsInstallPromptVisible] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState<boolean>(getStandaloneDisplayMode);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);

  // Fetch 30-day usage history when modal opens
  useEffect(() => {
    if (!isModelUsageModalOpen) {
      return;
    }
    let cancelled = false;
    const fetchHistory = async () => {
      setIsLoadingUsageHistory(true);
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_URL}/api/model-usage?limit=30`, { headers });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setUsageHistory(data.snapshots ?? []);
        }
      } catch {
        // ignore fetch errors
      } finally {
        if (!cancelled) {
          setIsLoadingUsageHistory(false);
        }
      }
    };
    fetchHistory();
    return () => { cancelled = true; };
  }, [isModelUsageModalOpen]);

  // Check auth on mount and fetch current user
  useEffect(() => {
    const token = getAuthToken();
    if (!token && window.location.pathname !== '/login') {
      window.location.assign('/login');
      return;
    }
    if (token) {
      fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.user) setCurrentUser(data.user);
        })
        .catch(() => { /* ignore */ });
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

        // Hydrate message processing states from DB
        const states: Record<string, MessageProcessingState> = {};
        for (const msg of messageData) {
          if (msg.processing_state) {
            states[msg.id] = msg.processing_state;
          }
        }
        if (Object.keys(states).length > 0) {
          setMessageStates((prev) => ({ ...prev, ...states }));
        }
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

  // Keep latest messages in view; mobile chat is newest-first, desktop is oldest-first.
  useEffect(() => {
    if (!isMobileLayout && isChatCollapsedDesktop) {
      return;
    }

    if (messages.length > 0) {
      const behavior = hasInitiallyScrolled.current ? 'smooth' : 'auto';
      if (isMobileLayout && mobileViewMode === 'chat') {
        const chatFeed = chatMessagesRef.current;
        if (chatFeed) {
          if (typeof chatFeed.scrollTo === 'function') {
            chatFeed.scrollTo({ top: 0, behavior });
          } else {
            chatFeed.scrollTop = 0;
          }
        }
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior });
      }
      hasInitiallyScrolled.current = true;
    }
  }, [messages, isMobileLayout, mobileViewMode, isChatCollapsedDesktop]);

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
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 768px)');
    setIsMobileLayout(mediaQuery.matches);

    const handleMediaQueryChange = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaQueryChange);
      return () => mediaQuery.removeEventListener('change', handleMediaQueryChange);
    }

    mediaQuery.addListener(handleMediaQueryChange);
    return () => mediaQuery.removeListener(handleMediaQueryChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      setIsInstallPromptVisible(!getStandaloneDisplayMode());
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setIsInstallPromptVisible(false);
      setIsStandaloneMode(true);
    };

    const standaloneMediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;

    const handleStandaloneChange = (event: MediaQueryListEvent) => {
      setIsStandaloneMode(event.matches || getStandaloneDisplayMode());
      if (event.matches) {
        setIsInstallPromptVisible(false);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (standaloneMediaQuery) {
      if (typeof standaloneMediaQuery.addEventListener === 'function') {
        standaloneMediaQuery.addEventListener('change', handleStandaloneChange);
      } else {
        standaloneMediaQuery.addListener(handleStandaloneChange);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);

      if (standaloneMediaQuery) {
        if (typeof standaloneMediaQuery.removeEventListener === 'function') {
          standaloneMediaQuery.removeEventListener('change', handleStandaloneChange);
        } else {
          standaloneMediaQuery.removeListener(handleStandaloneChange);
        }
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MOBILE_VIEW_MODE_KEY, mobileViewMode);
    } catch {
      // Ignore storage write failures.
    }
  }, [mobileViewMode]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    sendCurrentMessage();
  };

  const sendCurrentMessage = () => {
    if (!inputMessage.trim()) return;

    const msg = { sender: currentUser?.name || 'Unknown', content: inputMessage.trim() };

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

  const handleSelectMobileViewMode = (mode: MobileViewMode) => {
    setMobileViewMode(mode);
  };

  const toggleTopPanelsCollapse = () => {
    setIsTopPanelsCollapsed((prev) => !prev);
  };

  const toggleKanbanPanelCollapse = () => {
    setIsKanbanCollapsedDesktop((prev) => {
      const next = !prev;
      if (next && isChatCollapsedDesktop) {
        setIsChatCollapsedDesktop(false);
      }
      return next;
    });
  };

  const toggleChatPanelCollapse = () => {
    setIsChatCollapsedDesktop((prev) => {
      const next = !prev;
      if (next && isKanbanCollapsedDesktop) {
        setIsKanbanCollapsedDesktop(false);
      }
      return next;
    });
  };

  const handleInstallApp = async () => {
    if (!installPromptEvent) {
      return;
    }

    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;

    if (choice.outcome === 'accepted') {
      setIsInstallPromptVisible(false);
    }

    setInstallPromptEvent(null);
  };

  const workspacePanelsClassName = `workspace-panels${isKanbanCollapsedDesktop ? ' kanban-collapsed' : ''}${isChatCollapsedDesktop ? ' chat-collapsed' : ''}`;

  const renderChatPanel = (
    extraClass = '',
    composerAtTop = false,
    options: { collapsed?: boolean; onToggleCollapse?: () => void } = {}
  ) => {
    const isCollapsed = options.collapsed || false;
    const onToggleCollapse = options.onToggleCollapse;
    const orderedMessages = composerAtTop ? messages : [...messages].reverse();

    return (
      <section className={`panel chat-panel ${extraClass} ${isCollapsed ? 'collapsed' : ''}`.trim()} data-testid="chat-panel">
        <h2 className={`panel-heading ${onToggleCollapse ? 'panel-heading-with-action' : ''}`}>
          <span>
            {'\u{1F4AC}'} Chat
            {!socketConnected && (
              <span className="chat-connecting"> connecting...</span>
            )}
          </span>
          {onToggleCollapse && (
            <button
              type="button"
              className="panel-collapse-btn"
              onClick={onToggleCollapse}
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} chat panel`}
            >
              {isCollapsed ? 'Expand' : 'Collapse'}
            </button>
          )}
        </h2>
        {!isCollapsed && composerAtTop && (
          <form className="chat-input chat-input-top" onSubmit={sendMessage}>
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
        )}
        {!isCollapsed && (
          <div className="panel-content chat-messages" ref={chatMessagesRef}>
            {orderedMessages.length === 0 ? (
              <div className="empty-state">No messages yet</div>
            ) : (
              orderedMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-message ${msg.sender === currentUser?.name ? 'chat-operator' : 'chat-swissclaw'}`}
                >
                  <div className="chat-message-header">
                    <span className="chat-sender">
                      {msg.sender}
                      {msg.sender === currentUser?.name && messageStates[msg.id] && (
                        <span className={`message-state message-state-${messageStates[msg.id]}`}>
                          {messageStates[msg.id] === 'received' && ' \u2713'}
                          {messageStates[msg.id] === 'processing' && ' \u2699\uFE0F'}
                          {messageStates[msg.id] === 'done' && ' \u2705'}
                          {messageStates[msg.id] === 'failed' && ' \u274C'}
                          {messageStates[msg.id] === 'not-sent' && ' \u26A0\uFE0F'}
                          {messageStates[msg.id] === 'timeout' && ' \u23F1\uFE0F'}
                          {messageStates[msg.id] === 'cancelled' && ' \u2718'}
                        </span>
                      )}
                      {msg.sender === currentUser?.name &&
                        (messageStates[msg.id] === 'processing' || messageStates[msg.id] === 'received') && (
                        <button
                          className="cancel-message-btn"
                          onClick={() => socket?.emit('cancel-message', { messageId: msg.id })}
                          title="Cancel processing"
                        >
                          Cancel
                        </button>
                      )}
                    </span>
                    <span className="chat-time">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <span className="chat-text"><Markdown>{msg.content.replace(/\n/g, '  \n')}</Markdown></span>
                </div>
              ))
            )}
            {!composerAtTop && <div ref={messagesEndRef} />}
          </div>
        )}
        {!isCollapsed && !composerAtTop && (
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
        )}
      </section>
    );
  };

  const renderStatusPanel = () => (
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
          <span className="status-updated-inline">
            Updated:{' '}
            {status?.lastActive
              ? new Date(status.lastActive).toLocaleTimeString()
              : '\u2014'}
          </span>
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
                <button
                  type="button"
                  className="status-model-details-btn"
                  onClick={() => setIsModelUsageModalOpen(true)}
                >
                  View model breakdown ({status.modelUsage.models.length})
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );

  const renderActivitiesPanel = () => (
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
              const activitySender = getActivitySender(activity);
              const activitySenderLabel = activitySender || 'System';
              const activitySenderVariant = getActivitySenderVariant(activitySender);
              const activityDetails = (
                activitySender && activity.description.startsWith(`${activitySender}: `)
                  ? activity.description.slice(activitySender.length + 2)
                  : activity.description
              );

              return (
                <div
                  key={activityId}
                  className={`activity-item activity-item-${activitySenderVariant} ${isExpanded ? 'expanded' : ''}`}
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
                  <div className="activity-main">
                    <span className={`activity-sender activity-sender-${activitySenderVariant}`}>
                      {activitySenderLabel}
                    </span>
                    <span className="activity-text">{activityDetails}</span>
                  </div>

                  {isExpanded && (
                    <div className="activity-inline-details">
                      <div className="detail-row">
                        <span className="detail-label">Type:</span>
                        <span className="detail-value">{activity.type || 'N/A'}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Sender:</span>
                        <span className="detail-value">{activitySenderLabel}</span>
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
            <div ref={activityLoadMoreRef} className="activity-load-more">
              {isLoadingActivities && (
                <div className="loading-indicator">Loading more...</div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );

  const renderModelUsageModal = () => {
    if (!isModelUsageModalOpen || !status?.modelUsage) {
      return null;
    }

    return (
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-usage-modal-title"
        onClick={() => setIsModelUsageModalOpen(false)}
      >
        <div className="modal-content status-usage-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 id="model-usage-modal-title">Model Usage Breakdown</h3>
            <button
              type="button"
              className="modal-close"
              onClick={() => setIsModelUsageModalOpen(false)}
              aria-label="Close model usage dialog"
            >
              {'\u00D7'}
            </button>
          </div>
          <div className="modal-body">
            <div className="status-usage-modal-summary">
              <div className="stat-row">
                <span className="stat-label">Total tokens:</span>
                <span className="stat-value">{status.modelUsage.totals.totalTokens.toLocaleString()}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Requests:</span>
                <span className="stat-value">{status.modelUsage.totals.requestCount.toLocaleString()}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Paid cost:</span>
                <span className="stat-value">${getCostAmount(status.modelUsage.totals.costs, 'paid').toFixed(4)}</span>
              </div>
            </div>

            <div className="model-breakdown">
              {status.modelUsage.models.map((entry) => (
                <div key={entry.model} className="model-entry">
                  <span className="model-name">{entry.model}</span>
                  <span className="model-stats">
                    {entry.inputTokens.toLocaleString()} in / {entry.outputTokens.toLocaleString()} out
                    {' '}({entry.requestCount.toLocaleString()} req)
                    {' '}paid ${getCostAmount(entry.costs, 'paid').toFixed(4)}
                  </span>
                </div>
              ))}
            </div>

            <div className="usage-history-section">
              <h4>30-Day Summary</h4>
              {isLoadingUsageHistory ? (
                <p className="usage-history-loading">Loading...</p>
              ) : usageHistory && usageHistory.length > 0 ? (
                <table className="usage-history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Requests</th>
                      <th>Paid Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageHistory.map((snap) => (
                      <tr key={snap.usageDate}>
                        <td>{snap.usageDate}</td>
                        <td>{snap.totals.requestCount.toLocaleString()}</td>
                        <td>${getCostAmount(snap.totals.costs, 'paid').toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="usage-history-total">
                      <td>Total</td>
                      <td>
                        {usageHistory.reduce((sum, s) => sum + s.totals.requestCount, 0).toLocaleString()}
                      </td>
                      <td>
                        ${usageHistory.reduce((sum, s) => sum + getCostAmount(s.totals.costs, 'paid'), 0).toFixed(4)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="usage-history-loading">No usage history available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className="app">
      <header className="header">
        <h1>{'\u{1F980}'} Swissclaw Hub</h1>
        <div className="header-status">
          {currentUser?.role === 'admin' && (
            <button
              className="header-admin-btn"
              onClick={() => setIsUserManagementOpen(true)}
              title="Manage Users"
            >
              Users
            </button>
          )}
          <button
            className="header-logout-btn"
            onClick={async () => {
              const token = getAuthToken();
              if (token) {
                await fetch('/auth/logout', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                }).catch(() => {});
              }
              localStorage.removeItem('authToken');
              window.location.assign('/login');
            }}
            title="Log out"
          >
            Logout
          </button>
          <span
            className="indicator"
            style={{ background: socket?.connected ? '#4ade80' : '#ef4444' }}
          />
          <span className="version">{new Date(buildInfo.buildDate).toLocaleDateString()}</span>
        </div>
      </header>

      {!isStandaloneMode && isMobileLayout && isInstallPromptVisible && (
        <section className="install-banner" aria-label="Install app banner">
          <div className="install-banner-copy">
            <strong>Install Swissclaw Hub</strong>
            <span>Keep it on your home screen and launch it in a cleaner app-style view on mobile.</span>
          </div>
          <div className="install-banner-actions">
            <button type="button" className="install-banner-primary" onClick={handleInstallApp}>
              Install
            </button>
            <button
              type="button"
              className="install-banner-secondary"
              onClick={() => setIsInstallPromptVisible(false)}
            >
              Not now
            </button>
          </div>
        </section>
      )}

            <main className="main unified">
        {isMobileLayout && (
          <div className="mobile-mode-tabs" data-testid="mobile-mode-tabs">
            {MOBILE_VIEW_MODES.map((mode) => (
              <button
                key={mode.key}
                type="button"
                className={`mobile-mode-tab-btn ${mobileViewMode === mode.key ? 'active' : ''}`}
                onClick={() => handleSelectMobileViewMode(mode.key)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}

        {(!isMobileLayout || mobileViewMode === 'status' || mobileViewMode === 'activities') && (
          <section className={`top-panels ${isTopPanelsCollapsed && !isMobileLayout ? 'top-panels-collapsed' : ''} ${isMobileLayout ? 'mobile-active-panel' : ''}`}>
            {!isMobileLayout && (
              <div className="top-panels-header">
                <button
                  type="button"
                  className="panel-collapse-btn"
                  onClick={toggleTopPanelsCollapse}
                  aria-expanded={!isTopPanelsCollapsed}
                  aria-label={`${isTopPanelsCollapsed ? 'Expand' : 'Collapse'} status and activities`}
                >
                  {isTopPanelsCollapsed ? 'Expand Status & Activities' : 'Collapse'}
                </button>
              </div>
            )}
            {(!isTopPanelsCollapsed || isMobileLayout) && (
              <>
                {(!isMobileLayout || mobileViewMode === 'status') && renderStatusPanel()}
                {(!isMobileLayout || mobileViewMode === 'activities') && renderActivitiesPanel()}
              </>
            )}
          </section>
        )}

        {!isMobileLayout && (
          <section
            className={workspacePanelsClassName}
            data-testid="workspace-panels"
          >
            <div className={`kanban-panel-wrap ${isKanbanCollapsedDesktop ? 'collapsed' : ''}`.trim()}>
              <KanbanBoard
                collapsed={isKanbanCollapsedDesktop}
                showCollapseControl
                onToggleCollapse={toggleKanbanPanelCollapse}
              />
            </div>

            {renderChatPanel('', false, {
              collapsed: isChatCollapsedDesktop,
              onToggleCollapse: toggleChatPanelCollapse,
            })}
          </section>
        )}

        {isMobileLayout && mobileViewMode === 'kanban' && (
          <section className="mobile-workspace-panel" data-testid="mobile-kanban-panel">
            <div className="kanban-panel-wrap">
              <KanbanBoard />
            </div>
          </section>
        )}

        {isMobileLayout && mobileViewMode === 'chat' && renderChatPanel('mobile-chat-standalone', true)}
      </main>

      {renderModelUsageModal()}

      <UserManagement
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        currentUserId={currentUser?.id}
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


