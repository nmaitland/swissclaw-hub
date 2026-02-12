import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  ColumnName,
  KanbanCardTask,
  KanbanColumnDef,
  TasksByColumn,
  PriorityFilter,
} from '../types';
import './KanbanBoard.css';

const API_URL = process.env.REACT_APP_API_URL || '';
console.log('API_URL:', API_URL);

const COLUMNS: (KanbanColumnDef & { special?: boolean })[] = [
  { name: 'backlog', displayName: 'Backlog', emoji: '\u{1F4DD}', position: 0 },
  { name: 'todo', displayName: 'To Do', emoji: '\u{1F4CB}', position: 1 },
  { name: 'inProgress', displayName: 'In Progress', emoji: '\u{1F680}', position: 2 },
  { name: 'review', displayName: 'Review', emoji: '\u{1F440}', position: 3 },
  { name: 'done', displayName: 'Done', emoji: '\u{2705}', position: 4 },
  { name: 'waiting-for-neil', displayName: 'Waiting for Neil', emoji: '\u{23F8}\u{FE0F}', position: 5, special: true },
];

const getAuthToken = (): string | null => localStorage.getItem('authToken');

const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'high': return '#ef4444';
    case 'medium': return '#fbbf24';
    case 'low': return '#4ade80';
    default: return '#9ca3af';
  }
};

const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ─── Sortable Card ───────────────────────────────────────────────────────────

interface SortableCardProps {
  task: KanbanCardTask;
  onClick: (task: KanbanCardTask) => void;
}

function SortableCard({ task, onClick }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`kanban-card ${isDragging ? 'dragging' : ''}`}
      onClick={() => onClick(task)}
    >
      <CardContent task={task} />
    </div>
  );
}

// ─── Card Content (shared between normal and drag overlay) ───────────────────

function CardContent({ task }: { task: KanbanCardTask }) {
  return (
    <>
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
          <span className="kanban-card-assignee">{'\u{1F464}'} {task.assignedTo}</span>
        )}
        {task.tags && task.tags.length > 0 && (
          <div className="kanban-card-tags">
            {task.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="kanban-card-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Column Component ────────────────────────────────────────────────────────

interface KanbanColumnProps {
  col: KanbanColumnDef & { special?: boolean };
  tasks: KanbanCardTask[];
  totalInColumn: number;
  onTaskClick: (task: KanbanCardTask) => void;
  onAddClick: (columnName: ColumnName) => void;
}

function KanbanColumn({ col, tasks, totalInColumn, onTaskClick, onAddClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${col.name}` });

  return (
    <div className={`kanban-column ${col.special ? 'special-column' : ''} ${isOver ? 'drop-target' : ''}`}>
      <div className="kanban-column-header">
        <span className="kanban-column-emoji">{col.emoji}</span>
        <span className="kanban-column-title">{col.displayName}</span>
        <span className="kanban-column-count">{totalInColumn}</span>
        <button
          className="kanban-add-btn"
          onClick={() => onAddClick(col.name)}
          title="Add task"
        >
          +
        </button>
      </div>

      <div className="kanban-column-progress">
        <div
          className="kanban-column-progress-fill"
          style={{ width: totalInColumn > 0 ? '100%' : '0%' }}
        />
      </div>

      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="kanban-column-content" data-column={col.name}>
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} onClick={onTaskClick} />
          ))}
          {tasks.length === 0 && (
            <div className="kanban-empty-drop">
              <span className="kanban-empty-icon">{col.emoji}</span>
              <span>Drop tasks here</span>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Main KanbanBoard ────────────────────────────────────────────────────────

interface NewTaskForm {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  assignedTo: string;
  tags: string;
}

function KanbanBoard() {
  const [tasks, setTasks] = useState<TasksByColumn>({} as TasksByColumn);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<KanbanCardTask | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addColumnName, setAddColumnName] = useState<ColumnName>('backlog');
  const [newTask, setNewTask] = useState<NewTaskForm>({
    title: '',
    description: '',
    priority: 'medium',
    assignedTo: '',
    tags: '',
  });

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  // Drag state
  const [activeTask, setActiveTask] = useState<KanbanCardTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ─── Data Fetching ───────────────────────────────────────────────────

  const fetchKanbanData = useCallback(async () => {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {};

      const res = await fetch(`${API_URL}/api/kanban`, { headers });

      if (res.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch kanban data');

      const data = await res.json();
      setTasks(data.tasks || {});
      setLoading(false);
    } catch (err) {
      console.error('Kanban fetch error:', err);
      setError('Failed to load kanban board');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKanbanData();
  }, [fetchKanbanData]);

  // ─── Keyboard shortcut: Ctrl+K to focus search ─────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('kanban-search');
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Filtering Logic ───────────────────────────────────────────────

  const filteredTasks = useMemo((): TasksByColumn => {
    const result = {} as TasksByColumn;
    const query = searchQuery.toLowerCase();

    for (const col of COLUMNS) {
      const colTasks = tasks[col.name] || [];
      result[col.name] = colTasks.filter((task) => {
        // Priority filter
        if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
          return false;
        }
        // Search filter
        if (query) {
          return (
            task.title.toLowerCase().includes(query) ||
            (task.description || '').toLowerCase().includes(query) ||
            (task.taskId || '').toLowerCase().includes(query) ||
            (task.assignedTo || '').toLowerCase().includes(query) ||
            (task.tags || []).some((tag) => tag.toLowerCase().includes(query))
          );
        }
        return true;
      });
    }
    return result;
  }, [tasks, searchQuery, priorityFilter]);

  const totalTaskCount = useMemo(
    () => Object.values(tasks).reduce((acc, col) => acc + (col?.length || 0), 0),
    [tasks]
  );

  const filteredCount = useMemo(
    () => Object.values(filteredTasks).reduce((acc, col) => acc + (col?.length || 0), 0),
    [filteredTasks]
  );

  // ─── Drag and Drop ─────────────────────────────────────────────────

  const findTaskById = (id: string | number): KanbanCardTask | undefined => {
    for (const col of COLUMNS) {
      const found = (tasks[col.name] || []).find((t) => t.id === id);
      if (found) return found;
    }
    return undefined;
  };

  const findColumnForTask = (id: string | number): ColumnName | undefined => {
    for (const col of COLUMNS) {
      if ((tasks[col.name] || []).some((t) => t.id === id)) {
        return col.name;
      }
    }
    return undefined;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = findTaskById(event.active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const sourceColumn = findColumnForTask(active.id);
    if (!sourceColumn) return;

    // Determine target column
    let targetColumn: ColumnName | undefined;
    const overId = String(over.id);

    // Check if dropped on a column droppable (id = "column-<name>")
    if (overId.startsWith('column-')) {
      targetColumn = overId.replace('column-', '') as ColumnName;
    } else {
      // Dropped over another task — find its column
      targetColumn = findColumnForTask(over.id);
    }

    if (!targetColumn || sourceColumn === targetColumn) return;

    // Optimistic update
    const task = findTaskById(active.id);
    if (!task) return;

    setTasks((prev) => {
      const newTasks = { ...prev };
      newTasks[sourceColumn] = (prev[sourceColumn] || []).filter(
        (t) => t.id !== active.id
      );
      newTasks[targetColumn!] = [
        ...(prev[targetColumn!] || []),
        { ...task, columnName: targetColumn! },
      ];
      return newTasks;
    });

    // API call
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      };

      const res = await fetch(`${API_URL}/api/kanban/tasks/${active.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ columnName: targetColumn }),
      });

      if (!res.ok) {
        // Revert on failure
        await fetchKanbanData();
      }
    } catch {
      await fetchKanbanData();
    }
  };

  // ─── Task Actions ──────────────────────────────────────────────────

  const handleTaskClick = (task: KanbanCardTask) => {
    // Don't open modal if we were dragging
    if (activeTask) return;
    setSelectedTask(task);
    setShowModal(true);
  };

  const handleMoveTask = async (taskId: string | number, newColumn: ColumnName) => {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      };

      const res = await fetch(`${API_URL}/api/kanban/tasks/${taskId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ columnName: newColumn }),
      });

      if (!res.ok) throw new Error('Failed to move task');

      await fetchKanbanData();
      setShowModal(false);
      setSelectedTask(null);
    } catch (err) {
      console.error('Move task error:', err);
      alert('Failed to move task: ' + (err as Error).message);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      };

      const taskData = {
        columnName: addColumnName,
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        assignedTo: newTask.assignedTo,
        tags: newTask.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t),
      };

      console.log('Creating task:', {
        API_URL,
        url: `${API_URL}/api/kanban/tasks`,
        taskData,
        hasToken: !!token,
        tokenLength: token?.length
      });

      const res = await fetch(`${API_URL}/api/kanban/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify(taskData),
      });

      console.log('Response status:', res.status, res.statusText);
      console.log('Response headers:', Object.fromEntries(res.headers.entries()));
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'No response body');
        console.error('Failed to create task:', res.status, errorText);
        throw new Error(`Failed to create task: ${res.status} ${res.statusText} - ${errorText}`);
      }

      await fetchKanbanData();
      setShowAddModal(false);
      setNewTask({ title: '', description: '', priority: 'medium', assignedTo: '', tags: '' });
    } catch (err) {
      console.error('Create task error:', err);
      alert('Failed to create task: ' + (err as Error).message);
    }
  };

  const openAddModal = (columnName: ColumnName) => {
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

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="kanban-board">
        <div className="kanban-loading">
          <div className="kanban-skeleton">
            {COLUMNS.map((col) => (
              <div key={col.name} className="kanban-skeleton-col">
                <div className="skeleton-header" />
                <div className="skeleton-card" />
                <div className="skeleton-card short" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) return <div className="kanban-error">{error}</div>;

  return (
    <div className="kanban-board">
      <h2 className="kanban-title">{'\u{1F4CB}'} Kanban</h2>

      {/* Search/Filter Toolbar */}
      <div className="kanban-toolbar">
        <div className="kanban-toolbar-controls">
          <div className="kanban-search-wrapper">
            <input
              id="kanban-search"
              type="text"
              className="kanban-search"
              placeholder="Search tasks... (Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="kanban-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                {'\u00D7'}
              </button>
            )}
          </div>

          <div className="kanban-filters">
            {(['all', 'high', 'medium', 'low'] as PriorityFilter[]).map((p) => (
              <button
                key={p}
                className={`kanban-filter-chip ${priorityFilter === p ? 'active' : ''} ${p !== 'all' ? `priority-${p}` : ''}`}
                onClick={() => setPriorityFilter(p)}
              >
                {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          <span className="kanban-task-count">
            {searchQuery || priorityFilter !== 'all'
              ? `${filteredCount} / ${totalTaskCount}`
              : totalTaskCount}{' '}
            tasks
          </span>
        </div>
      </div>

      {/* Kanban Board with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-columns">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.name}
              col={col}
              tasks={filteredTasks[col.name] || []}
              totalInColumn={(tasks[col.name] || []).length}
              onTaskClick={handleTaskClick}
              onAddClick={openAddModal}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="kanban-card drag-overlay">
              <CardContent task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Task Detail Modal */}
      {showModal && selectedTask && (
        <div className="modal-overlay" onClick={closeTaskModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-task-id">{selectedTask.taskId}</span>
              <button className="modal-close" onClick={closeTaskModal}>
                {'\u00D7'}
              </button>
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
                        <span key={i} className="modal-tag">
                          {tag}
                        </span>
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
              <h3>
                Add Task to {COLUMNS.find((c) => c.name === addColumnName)?.displayName}
              </h3>
              <button className="modal-close" onClick={closeAddModal}>
                {'\u00D7'}
              </button>
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
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        priority: e.target.value as 'low' | 'medium' | 'high',
                      })
                    }
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

              <div className="modal-form-actions">
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
