-- Test database initialization script
-- This script runs when the test database container starts

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create kanban_tasks table
CREATE TABLE IF NOT EXISTS kanban_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo',
    priority VARCHAR(20) DEFAULT 'medium',
    assigned_to VARCHAR(255),
    "column" VARCHAR(50) DEFAULT 'backlog',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create activities table
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create security_logs table
CREATE TABLE IF NOT EXISTS security_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    method VARCHAR(10),
    path VARCHAR(255),
    status_code INTEGER,
    ip_address VARCHAR(45),
    user_agent TEXT,
    user_id UUID REFERENCES users(id),
    duration INTEGER,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_status ON kanban_tasks(status);
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_assigned_to ON kanban_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_type ON security_logs(type);
CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at);

-- Insert test data for integration tests
INSERT INTO users (id, email, name, role) VALUES 
    ('test-user-1', 'test@example.com', 'Test User', 'user'),
    ('test-user-2', 'neil@example.com', 'Neil', 'admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO kanban_tasks (id, title, description, status, priority, assigned_to, column, created_by) VALUES 
    ('task-1', 'Test Task 1', 'Description for test task 1', 'todo', 'high', 'swissclaw', 'todo', 'test-user-1'),
    ('task-2', 'Test Task 2', 'Description for test task 2', 'inprogress', 'medium', 'neil', 'inprogress', 'test-user-2'),
    ('task-3', 'Test Task 3', 'Description for test task 3', 'done', 'low', 'swissclaw', 'done', 'test-user-1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (id, sender_id, content) VALUES 
    ('msg-1', 'test-user-1', 'Test message 1'),
    ('msg-2', 'test-user-1', 'Test message 2')
ON CONFLICT (id) DO NOTHING;
