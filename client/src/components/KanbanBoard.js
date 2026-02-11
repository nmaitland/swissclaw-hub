import React, { useState, useEffect } from 'react';
import './KanbanBoard.css';

const API_URL = process.env.REACT_APP_API_URL || '';

const COLUMNS = [
  { name: 'backlog', displayName: 'Backlog', emoji: '📝' },
  { name: 'todo', displayName: 'To Do', emoji: '📋' },
  { name: 'inProgress', displayName: 'In Progress', emoji: '🚀' },
  { name: 'review', displayName: 'Review', emoji: '👀' },
  { name: 'done', displayName: 'Done', emoji: '✅' },
  { name: 'waiting-for-neil', displayName: 'Waiting for Neil', emoji: '⏸️', special: true }
];

const getAuthToken = () => localStorage.getItem('authToken');

const getPriorityColor = (priority) => {
  switch (priority) {
    case 'high': return '#ef4444';
    case 'medium': return '#fbbf24';
    case 'low': return '#4ade80';
    default: return '#9ca3af';
  }
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function KanbanBoard() {
  const [, setColumns] = useState([]);
  const [tasks, setTasks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addColumnName, setAddColumnName] = useState('');
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    assignedTo: '',
    tags: ''
  });

  const fetchKanbanData = async () => {
    try {
      const token = getAuthToken();
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const res = await fetch(`${API_URL}/api/kanban`, { headers });
      
      if (res.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
        return;
      }

      if (!res.ok) throw new Error('Failed to fetch kanban data');
      
      const data = await res.json();
      setColumns(data.columns || []);
      setTasks(data.tasks || {});
      setLoading(false);
    } catch (err) {
      console.error('Kanban fetch error:', err);
      setError('Failed to load kanban board');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKanbanData();
  }, []);

  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setShowModal(true);
  };

  const handleMoveTask = async (taskId, newColumn) => {
    try {
      const token = getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      };

      const res = await fetch(`${API_URL}/api/kanban/tasks/${taskId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ columnName: newColumn })
      });

      if (!res.ok) throw new Error('Failed to move task');
      
      await fetchKanbanData();
      setShowModal(false);
      setSelectedTask(null);
    } catch (err) {
      console.error('Move task error:', err);
      alert('Failed to move task: ' + err.message);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    
    try {
      const token = getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      };

      const taskData = {
        columnName: addColumnName,
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        assignedTo: newTask.assignedTo,
        tags: newTask.tags.split(',').map(t => t.trim()).filter(t => t)
      };

      const res = await fetch(`${API_URL}/api/kanban/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(taskData)
      });

      if (!res.ok) throw new Error('Failed to create task');
      
      await fetchKanbanData();
      setShowAddModal(false);
      setNewTask({ title: '', description: '', priority: 'medium', assignedTo: '', tags: '' });
    } catch (err) {
      console.error('Create task error:', err);
      alert('Failed to create task: ' + err.message);
    }
  };

  const openAddModal = (columnName) => {
    setAddColumnName(columnName);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewTask({ title: '', description: '', priority: 'medium', assignedTo: '', tags: '' });
  };

  const closeTaskModal = () => {
    setShowModal(false);
    setSelectedTask(null);
  };

  if (loading) return <div className="kanban-loading">Loading kanban...</div>;
  if (error) return <div className="kanban-error">{error}</div>;

  return (
    <div className="kanban-board">
      <h2 className="kanban-title">🦀 Swissclaw Kanban</h2>
      
      <div className="kanban-columns">
        {COLUMNS.map((col) => {
          const colTasks = tasks[col.name] || [];
          const isSpecial = col.special;
          
          return (
            <div key={col.name} className={`kanban-column ${isSpecial ? 'special-column' : ''}`}>
              <div className="kanban-column-header">
                <span className="kanban-column-emoji">{col.emoji}</span>
                <span className="kanban-column-title">{col.displayName}</span>
                <span className="kanban-column-count">{colTasks.length}</span>
                <button 
                  className="kanban-add-btn" 
                  onClick={() => openAddModal(col.name)}
                  title="Add task"
                >
                  +
                </button>
              </div>
              
              <div className="kanban-column-content">
                {colTasks.map((task) => (
                  <div 
                    key={task.id} 
                    className="kanban-card"
                    onClick={() => handleTaskClick(task)}
                  >
                    <div className="kanban-card-header">
                      <span className="kanban-card-id">{task.taskId}</span>
                      <span 
                        className="kanban-card-priority"
                        style={{ background: getPriorityColor(task.priority) }}
                      >
                        {task.priority}
                      </span>
                    </div>
                    
                    <div className="kanban-card-title">{task.title}</div>
                    
                    {task.description && (
                      <div className="kanban-card-desc">{task.description}</div>
                    )}
                    
                    <div className="kanban-card-footer">
                      {task.assignedTo && (
                        <span className="kanban-card-assignee">
                          👤 {task.assignedTo}
                        </span>
                      )}
                      
                      {task.tags && task.tags.length > 0 && (
                        <div className="kanban-card-tags">
                          {task.tags.slice(0, 3).map((tag, i) => (
                            <span key={i} className="kanban-card-tag">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {colTasks.length === 0 && (
                  <div className="kanban-empty">No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Detail Modal */}
      {showModal && selectedTask && (
        <div className="modal-overlay" onClick={closeTaskModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-task-id">{selectedTask.taskId}</span>
              <button className="modal-close" onClick={closeTaskModal}>×</button>
            </div>
            
            <div className="modal-body">
              <h3 className="modal-title">{selectedTask.title}</h3>
              
              {selectedTask.description && (
                <p className="modal-description">{selectedTask.description}</p>
              )}
              
              <div className="modal-meta">
                <div className="modal-meta-item">
                  <span className="modal-meta-label">Priority:</span>
                  <span 
                    className="modal-priority-badge"
                    style={{ background: getPriorityColor(selectedTask.priority) }}
                  >
                    {selectedTask.priority}
                  </span>
                </div>
                
                {selectedTask.assignedTo && (
                  <div className="modal-meta-item">
                    <span className="modal-meta-label">Assigned to:</span>
                    <span>{selectedTask.assignedTo}</span>
                  </div>
                )}
                
                {selectedTask.tags && selectedTask.tags.length > 0 && (
                  <div className="modal-meta-item">
                    <span className="modal-meta-label">Tags:</span>
                    <div className="modal-tags">
                      {selectedTask.tags.map((tag, i) => (
                        <span key={i} className="modal-tag">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="modal-meta-item">
                  <span className="modal-meta-label">Created:</span>
                  <span>{formatDate(selectedTask.createdAt)}</span>
                </div>
              </div>
              
              <div className="modal-actions">
                <p className="modal-actions-label">Move to:</p>
                <div className="modal-move-buttons">
                  {COLUMNS.map((col) => (
                    <button
                      key={col.name}
                      className={`modal-move-btn ${selectedTask.columnName === col.name ? 'active' : ''}`}
                      onClick={() => handleMoveTask(selectedTask.id, col.name)}
                      disabled={selectedTask.columnName === col.name}
                    >
                      {col.emoji} {col.displayName}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Task to {COLUMNS.find(c => c.name === addColumnName)?.displayName}</h3>
              <button className="modal-close" onClick={closeAddModal}>×</button>
            </div>
            
            <form className="modal-form" onSubmit={handleCreateTask}>
              <div className="form-group">
                <label htmlFor="task-title">Title *</label>
                <input
                  id="task-title"
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Enter task title..."
                  required
                  autoFocus
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="task-desc">Description</label>
                <textarea
                  id="task-desc"
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Enter task description..."
                  rows={3}
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="task-priority">Priority</label>
                  <select
                    id="task-priority"
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="task-assignee">Assigned To</label>
                  <input
                    id="task-assignee"
                    type="text"
                    value={newTask.assignedTo}
                    onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                    placeholder="e.g. neil, swissclaw"
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="task-tags">Tags (comma separated)</label>
                <input
                  id="task-tags"
                  type="text"
                  value={newTask.tags}
                  onChange={(e) => setNewTask({ ...newTask, tags: e.target.value })}
                  placeholder="e.g. bug, feature, urgent"
                />
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={closeAddModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit">
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default KanbanBoard;
