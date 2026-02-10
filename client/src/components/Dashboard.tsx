import React from 'react';
import { User, Status, KanbanTask, Message, Activity, HealthCheck } from '../types';

interface DashboardProps {
  user: User;
  status: Status[];
  messages: Message[];
  kanban: KanbanTask[];
  activities: Activity[];
  health: HealthCheck | null;
  socket: any;
  loading: boolean;
  error: string | null;
  onLogout: () => void;
  token: string;
}

const Dashboard: React.FC<DashboardProps> = ({
  user,
  status,
  messages,
  kanban,
  activities,
  health,
  socket,
  loading,
  error,
  onLogout,
  token
}) => {
  return (
    <div className="dashboard">
      <header>
        <h1>Swissclaw Hub Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user.name}</span>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {loading && (
        <div className="loading">
          Loading...
        </div>
      )}
      
      <main>
        <section className="status-section">
          <h2>Status Updates</h2>
          {status.map(item => (
            <div key={item.id} className="status-item">
              <p>{item.status}</p>
              <small>{new Date(item.last_updated).toLocaleString()}</small>
            </div>
          ))}
        </section>
        
        <section className="kanban-section">
          <h2>Kanban Board</h2>
          <div className="kanban-board">
            {['backlog', 'todo', 'inprogress', 'review', 'done'].map(column => (
              <div key={column} className="kanban-column">
                <h3>{column}</h3>
                {kanban
                  .filter(task => task.column === column)
                  .map(task => (
                    <div key={task.id} className="kanban-task">
                      <h4>{task.title}</h4>
                      {task.description && <p>{task.description}</p>}
                      <span className="priority">{task.priority}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </section>
        
        <section className="messages-section">
          <h2>Messages</h2>
          {messages.map(message => (
            <div key={message.id} className="message">
              <strong>{message.sender?.name || 'Unknown'}:</strong>
              <p>{message.content}</p>
              <small>{new Date(message.created_at).toLocaleString()}</small>
            </div>
          ))}
        </section>
        
        <section className="activities-section">
          <h2>Recent Activities</h2>
          {activities.map(activity => (
            <div key={activity.id} className="activity">
              <p>{activity.description}</p>
              <small>{new Date(activity.created_at).toLocaleString()}</small>
            </div>
          ))}
        </section>
        
        {health && (
          <section className="health-section">
            <h2>System Health</h2>
            <div className="health-status">
              <span>Status: {health.status}</span>
              <span>Uptime: {Math.floor(health.uptime || 0)}s</span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
