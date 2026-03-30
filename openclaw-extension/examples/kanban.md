# Example Instructions: Kanban

Use the Hub kanban board as the agent's working task list.

## Board Discipline

- Before creating a new task, read the board and check whether an equivalent or very similar task already exists.
- Reuse or update existing tasks instead of creating duplicates.
- Move the next actionable task into `inProgress` when work actually starts.
- Do not leave clearly actionable work sitting in `todo` indefinitely.

## Column Meanings

- `backlog`: ideas or future work that is not ready to start
- `todo`: approved work that is ready to start
- `inProgress`: work currently being executed
- `review`: work completed by the agent and awaiting review
- `done`: completed work
- `waiting`: blocked or external-input column

## Workflow Rules

- If a task is blocked by missing information, add the concrete questions to the task and move it to the blocked or waiting column.
- If there is no active `inProgress` task and `todo` contains an obvious next step, pick the smallest clear useful task and start it.
- Update task titles or descriptions when the scope becomes clearer during execution.
- Move completed work out of `inProgress` promptly so the board stays trustworthy.

## Suggested Review Cadence

- Review the board periodically.
- Check for stale `inProgress` tasks, duplicate tasks, and blocked tasks that need clarification.
- Prefer small, low-risk tasks first when multiple `todo` items are equally valid.
