# Example Instructions: Status

Use the Hub status panel to show what the agent is doing right now.

## When To Update Status

- Set status when starting a meaningful task.
- Refresh status when the current task changes materially.
- Clear or simplify status when work is complete.
- Keep `lastActive` current while the agent is actively working.

## State Guidance

- `active`: normal focused work
- `busy`: heavier work, waiting on long-running operations, or handling multiple things at once
- `idle`: no active task

## Task Text

- Keep `currentTask` short and specific.
- Describe the user-visible unit of work, not internal implementation trivia.

Good examples:

- `Reviewing incoming Hub messages`
- `Updating kanban ticket flow`
- `Debugging chat delivery issue`

Avoid:

- Vague text such as `Working`
- Long internal notes better suited for logs or task descriptions

## Practical Rule

- Status should help a human understand the agent's current focus at a glance.
- If the same information already appears elsewhere in more detail, keep the status line minimal.
