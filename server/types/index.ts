export interface User {
  id: string;
  email: string;
  name: string;
  password_hash?: string;
  role: 'admin' | 'user';
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  user_agent?: string;
  ip_address?: string;
  expires_at: Date;
  created_at: Date;
  last_accessed_at: Date;
  revoked_at?: Date;
}

export interface KanbanTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: 'low' | 'medium' | 'high';
  assigned_to?: string;
  column: 'backlog' | 'todo' | 'inprogress' | 'review' | 'done' | 'waiting-for-neil';
  tags: string[];
  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

export interface Message {
  id: string;
  sender_id?: string;
  content: string;
  attachments: any[];
  thread_id?: string;
  created_at: Date;
  read_at?: Date;
}

export interface Activity {
  id: string;
  type: string;
  description: string;
  metadata: Record<string, any>;
  user_id?: string;
  created_at: Date;
}

export interface SecurityLog {
  id: string;
  type: string;
  method?: string;
  path?: string;
  status_code?: number;
  ip_address?: string;
  user_agent?: string;
  user_id?: string;
  duration?: number;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface Status {
  id: string;
  status: string;
  current_task?: string;
  last_updated: Date;
}

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    name: string;
    role: string;
    sessionId: string;
  };
  sessionId: string;
}

export interface DatabaseConfig {
  user: string;
  host: string;
  database: string;
  password: string;
  port: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  connectionString?: string;
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

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
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
