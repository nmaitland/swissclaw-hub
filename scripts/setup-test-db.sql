-- Test Database Setup Script
-- Run this script to create the test database and required tables

-- Create test database (run as postgres user)
-- CREATE DATABASE swissclaw_hub_test;

-- Connect to test database and create tables
\c swissclaw_hub_test;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create status table
CREATE TABLE IF NOT EXISTS status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(100) NOT NULL,
    current_task TEXT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create kanban_tasks table (updated for new kanban system)
CREATE TABLE IF NOT EXISTS kanban_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo',
    priority VARCHAR(10) DEFAULT 'medium',
    assigned_to VARCHAR(50),
    column VARCHAR(50) DEFAULT 'backlog',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',
    thread_id UUID REFERENCES messages(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE
);

-- Create activities table
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_column ON kanban_tasks(column);
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_assigned_to ON kanban_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_priority ON kanban_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_status ON kanban_tasks(status);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);

-- Insert test data
INSERT INTO users (id, email, name, role) VALUES 
    ('test-user-1', 'swissclaw@example.com', 'SwissClaw', 'admin'),
    ('test-user-2', 'neil@example.com', 'Neil', 'user')
ON CONFLICT (id) DO NOTHING;

-- Insert test status
INSERT INTO status (status, current_task) VALUES 
    ('Working', 'Setting up test infrastructure')
ON CONFLICT DO NOTHING;

-- Insert test kanban tasks
INSERT INTO kanban_tasks (id, title, description, status, priority, assigned_to, column, tags) VALUES 
    ('task-1', 'Set up testing infrastructure', 'Install Jest, React Testing Library, and Cypress', 'todo', 'high', 'swissclaw', 'todo', ARRAY['testing', 'infrastructure']),
    ('task-2', 'Implement security hardening', 'Add proper session storage and input validation', 'todo', 'high', 'swissclaw', 'todo', ARRAY['security']),
    ('task-3', 'Add TypeScript support', 'Convert client and server to TypeScript', 'backlog', 'medium', 'neil', 'backlog', ARRAY['typescript']),
    ('task-4', 'Create comprehensive tests', 'Write unit and integration tests for all components', 'inprogress', 'high', 'swissclaw', 'inprogress', ARRAY['testing'])
ON CONFLICT (id) DO NOTHING;

-- Insert test messages
INSERT INTO messages (id, sender_id, content) VALUES 
    ('msg-1', 'test-user-1', 'Testing infrastructure setup is complete'),
    ('msg-2', 'test-user-2', 'Great! Let me know when you need me to review the tests'),
    ('msg-3', 'test-user-1', 'Will do. I''m working on the API tests now.')
ON CONFLICT (id) DO NOTHING;

-- Insert test activities
INSERT INTO activities (id, type, description, user_id, metadata) VALUES 
    ('activity-1', 'task_created', 'Created task: Set up testing infrastructure', 'test-user-1', '{"task_id": "task-1"}'),
    ('activity-2', 'task_updated', 'Updated task status to in-progress', 'test-user-1', '{"task_id": "task-4", "old_status": "todo", "new_status": "inprogress"}'),
    ('activity-3', 'message_sent', 'Sent message about testing completion', 'test-user-1', '{"message_id": "msg-1"}')
ON CONFLICT (id) DO NOTHING;
