# Task Ordering Implementation Plan

## Overview
Implement editable task ordering within kanban columns using a sparse ranking strategy to minimize database updates when reordering.

## Design: Sparse Ordering with BIGINT

### Core Concept
Instead of sequential integers (0, 1, 2, 3...), use sparse values with large gaps:
- **Base gap**: 1,000,000 (1 million)
- **Initial positions**: 0, 1000000, 2000000, 3000000...
- **Insert between A and B**: `new_position = (A + B) / 2`

### Example Flow
```
Initial:     [Task A: 0] [Task B: 1000000] [Task C: 2000000]
Insert X:    [Task A: 0] [X: 500000] [Task B: 1000000] [Task C: 2000000]
Insert Y:    [Task A: 0] [Y: 250000] [X: 500000] [Task B: 1000000] [Task C: 2000000]
```

### Rebalancing Trigger
When gap between adjacent tasks < 100:
- Reassign all positions in column: 0, 1000000, 2000000...
- Only affects one column, not entire board

## Database Changes

### Migration: Alter position column to BIGINT
```javascript
// database/migrations/20260213000000-alter-task-position-bigint.js
await queryInterface.changeColumn('kanban_tasks', 'position', {
  type: Sequelize.BIGINT,
  defaultValue: 0
});
```

### Rebalance Function (PostgreSQL)
```sql
CREATE OR REPLACE FUNCTION rebalance_column_positions(p_column_id INTEGER)
RETURNS VOID AS $$
DECLARE
  gap CONSTANT BIGINT := 1000000;
BEGIN
  UPDATE kanban_tasks t
  SET position = subquery.new_position
  FROM (
    SELECT id, (ROW_NUMBER() OVER (ORDER BY position) - 1) * gap as new_position
    FROM kanban_tasks
    WHERE column_id = p_column_id
  ) subquery
  WHERE t.id = subquery.id;
END;
$$ LANGUAGE plpgsql;
```

## API Changes

### 1. Update PUT /api/kanban/tasks/:id
Accept optional `position` field. Calculate new position if `targetTaskId` provided.

**Request Body Options:**
```typescript
// Option A: Direct position (for simple cases)
{
  columnName?: string;
  position?: number;  // New: explicit position
  title?: string;
  // ... other fields
}

// Option B: Relative positioning (for drag-drop)
{
  columnName?: string;
  targetTaskId?: string;  // ID of task to insert before/after
  insertAfter?: boolean;  // true = after target, false = before
  // ... other fields
}
```

### 2. New Endpoint: POST /api/kanban/reorder
Batch reorder for multiple tasks (optimization).

```typescript
POST /api/kanban/reorder
{
  columnId: number;
  taskPositions: [{ taskId: string, position: number }];
}
```

## Frontend Changes

### 1. Enable Intra-Column Sorting
Update KanbanColumn component to use dnd-kit's SortableContext:

```typescript
// In KanbanColumn component
<SortableContext
  items={tasks.map(t => t.id)}
  strategy={verticalListSortingStrategy}
>
  {tasks.map(task => (
    <SortableCard key={task.id} task={task} ... />
  ))}
</SortableContext>
```

### 2. Calculate New Position on Drop
```typescript
function calculateNewPosition(
  tasks: KanbanCardTask[],
  activeId: string,
  overId: string,
  isSameColumn: boolean
): number {
  const overIndex = tasks.findIndex(t => t.id === overId);
  const activeIndex = tasks.findIndex(t => t.id === activeId);
  
  if (overIndex === -1) return tasks[tasks.length - 1]?.position + 1000000 || 0;
  
  const prevTask = tasks[overIndex - 1];
  const nextTask = tasks[overIndex];
  
  if (!prevTask) {
    // Dropping at top - use half of next task's position
    return Math.floor(nextTask.position / 2);
  }
  
  // Dropping between prev and next
  return Math.floor((prevTask.position + nextTask.position) / 2);
}
```

### 3. Handle Rebalancing Response
If API returns `needsRebalance: true`, trigger a refetch.

## Implementation Steps

### Phase 1: Database
1. Create migration to change `position` to BIGINT
2. Add rebalance stored procedure
3. Seed existing tasks with sparse positions

### Phase 2: Backend
1. Update `PUT /api/kanban/tasks/:id` to handle position updates
2. Add position calculation logic
3. Add rebalance trigger when gaps are too small
4. Update `POST /api/kanban/tasks` to use sparse positioning

### Phase 3: Frontend
1. Update types to include position field
2. Modify `handleDragEnd` to calculate new positions
3. Support intra-column reordering in SortableContext
4. Handle rebalancing indicator/refresh

### Phase 4: Testing
1. Test reordering within column
2. Test moving between columns with position
3. Test rebalancing trigger
4. Test edge cases (empty column, single task, etc.)

## Edge Cases

1. **Empty column**: New task gets position 0
2. **Drop at top**: New position = floor(next.position / 2)
3. **Drop at bottom**: New position = last.position + 1000000
4. **Gap too small**: Trigger rebalance, then retry
5. **Concurrent edits**: Optimistic locking with version field (optional)

## Benefits

- **Minimal updates**: Only the moved task needs updating in most cases
- **Scalable**: Can handle thousands of reorderings before rebalancing
- **Simple**: No separate ordering table needed
- **Fast**: Single UPDATE statement for most operations
