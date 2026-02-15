import { Request } from 'express';

// Database row types
export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  role: string;
  created_at: Date;
  updated_at: Date;
  last_login: Date | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: Date;
  created_at: Date;
  last_accessed_at: Date;
  revoked_at: Date | null;
  // Joined fields from users table
  email?: string;
  name?: string;
  role?: string;
}

export interface MessageRow {
  id: number;
  sender: string;
  content: string;
  created_at: Date;
}

export interface ActivityRow {
  id: number;
  type: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface KanbanColumnRow {
  id: number;
  name: string;
  display_name: string;
  emoji: string;
  color: string;
  position: number;
  created_at: Date;
}

export interface KanbanTaskRow {
  id: number;
  task_id: string | null;
  column_id: number;
  title: string;
  description: string | null;
  priority: string;
  assigned_to: string | null;
  tags: string[];
  attachment_count: number;
  comment_count: number;
  position: number;
  created_at: Date;
  updated_at: Date;
}

export interface SecurityLogRow {
  id: string;
  type: string;
  method: string | null;
  path: string | null;
  status_code: number | null;
  ip_address: string | null;
  user_agent: string | null;
  user_id: string | null;
  duration: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// Session info returned after validation
export interface SessionInfo {
  userId: string;
  email: string;
  name: string;
  role: string;
  sessionId: string;
}

// Security event for audit logging
export interface SecurityEvent {
  type: string;
  method?: string;
  path?: string;
  statusCode?: number;
  ip?: string;
  userAgent?: string;
  userId?: string;
  duration?: number;
  responseSize?: number;
  metadata?: Record<string, unknown>;
}

// Database health check result
export interface DatabaseHealthResult {
  status: 'healthy' | 'unhealthy';
  timestamp?: Date;
  version?: string;
  error?: string;
}

// Build info
export interface BuildInfo {
  buildDate: string;
  commit: string;
}

// Chat message data from socket
export interface ChatMessageData {
  sender: string;
  content: string;
}

// Rate limit tracking
export interface RateLimitEntry {
  count: number;
  lastReset: number;
  resetTime?: number;
}

// Kanban task API response shape
export interface KanbanTaskResponse {
  id: number;
  taskId: string;
  title: string;
  description: string;
  priority: string;
  assignedTo: string | null;
  tags: string[];
  attachmentCount?: number;
  commentCount?: number;
  position?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Parsed task from kanban.md
export interface ParsedTask {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  priority: string;
  dueDate: string | null;
}

// Database config
export interface DatabaseConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  user?: string;
  host?: string;
  database?: string;
  password?: string;
  port?: number;
  connectionString?: string;
}

// Extend Express Request with user info
export interface AuthenticatedRequest extends Request {
  user?: SessionInfo;
}

// Validation schema interface (for validateRequest middleware)
export interface ValidationSchema {
  validate: (body: unknown) => { error?: { details: Array<{ path: string[]; message: string }> } };
}
