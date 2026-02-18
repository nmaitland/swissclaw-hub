export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt?: string;
  lastLogin?: string;
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
export type ColumnName = 'backlog' | 'todo' | 'inProgress' | 'review' | 'done' | 'waiting-for-neil';

export interface KanbanCardTask {
  id: number | string;
  taskId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  assignedTo: string;
  tags: string[];
  createdAt: string;
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

export interface ModelUsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface ModelUsage {
  total: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
  byModel: ModelUsageEntry[];
  since: string;
}

export interface StatusResponse {
  swissclaw: {
    state: 'active' | 'busy' | 'idle';
    currentTask: string;
    lastActive: string;
  };
  activityCount: number;
  modelUsage: ModelUsage;
  recentMessages: ChatMessage[];
  recentActivities: Activity[];
}

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  created_at: string;
}

export type MessageProcessingState = 'received' | 'processing' | 'thinking' | 'responded';

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
  column?: 'backlog' | 'todo' | 'inprogress' | 'review' | 'done' | 'waiting-for-neil';
  tags?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  assigned_to?: string;
  column?: 'backlog' | 'todo' | 'inprogress' | 'review' | 'done' | 'waiting-for-neil';
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
