export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt?: string;
  lastLogin?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  googleId: string | null;
}

export interface Status {
  id: string;
  status: string;
  current_task?: string;
  last_updated: string;
}

export interface KanbanTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: 'low' | 'medium' | 'high';
  assigned_to?: string;
  column: ColumnName;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// Types matching the actual API response shape from GET /api/kanban
export type ColumnName = 'backlog' | 'todo' | 'inProgress' | 'review' | 'done' | 'waiting';

export interface KanbanCardTask {
  id: number | string;
  taskId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  assignedTo: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  columnName: ColumnName;
  position?: number; // Added for sparse ordering
}

export interface KanbanColumnDef {
  name: ColumnName;
  displayName: string;
  emoji: string;
  color?: string;
  position: number;
  special?: boolean;
}

export type TasksByColumn = Record<ColumnName, KanbanCardTask[]>;

export interface KanbanApiResponse {
  columns: KanbanColumnDef[];
  tasks: TasksByColumn;
}

export type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

export type ModelUsageCostType = 'paid' | 'free_tier_potential';

export interface ModelUsageCostBucket {
  type: ModelUsageCostType;
  amount: number;
}

export interface ModelUsageEntry {
  model: string;
  provider?: string | null;
  source?: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  costs: ModelUsageCostBucket[];
}

export interface ModelUsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  costs: ModelUsageCostBucket[];
}

export interface ModelUsageSnapshot {
  usageDate: string;
  updatedAt: string;
  models: ModelUsageEntry[];
  totals: ModelUsageTotals;
}

export interface StatusResponse {
  state: 'active' | 'busy' | 'idle';
  currentTask: string;
  lastActive: string;
  chatCount: number;
  activityCount: number;
  modelUsage: ModelUsageSnapshot | null;
}

// Legacy type kept for compatibility in older tests/docs.
export interface ModelUsage {
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requestCount: number;
    costs: ModelUsageCostBucket[];
  };
  models: ModelUsageEntry[];
  usageDate: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  created_at: string;
  processing_state?: MessageProcessingState | null;
}

export type MessageProcessingState = 'received' | 'processing' | 'done' | 'failed' | 'not-sent' | 'timeout' | 'cancelled';

export interface MessageStateUpdate {
  messageId: string;
  state: MessageProcessingState;
}

export interface BuildInfo {
  buildDate: string;
  commit: string;
}

export interface Message {
  id: string;
  sender_id?: string;
  content: string;
  attachments: any[];
  thread_id?: string;
  created_at: string;
  read_at?: string;
  sender?: {
    id: string;
    name: string;
  };
}

export interface Activity {
  id: string;
  type: string;
  description: string;
  sender?: string | null;
  metadata: Record<string, any>;
  user_id?: string;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  assigned_to?: string;
  column?: 'backlog' | 'todo' | 'inprogress' | 'review' | 'done' | 'waiting';
  tags?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  assigned_to?: string;
  column?: 'backlog' | 'todo' | 'inprogress' | 'review' | 'done' | 'waiting';
  tags?: string[];
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime?: number;
  memory?: {
    used: number;
    total: number;
  };
  database?: {
    status: string;
    timestamp: string;
    version?: string;
    error?: string;
  };
  version?: string;
  error?: string;
}

export interface SocketUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  sessionId: string;
}

export interface SocketMessage {
  content: string;
}

export interface BroadcastMessage {
  id: string;
  content: string;
  sender: {
    id: string;
    name: string;
  };
  created_at: Date;
}
