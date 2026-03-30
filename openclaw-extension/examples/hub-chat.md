# Example Instructions: Hub Chat

Use the `swissclaw-hub` channel for direct chat with the Hub.

## Operating Model

- Treat Hub chat as a real-time conversation channel.
- Read inbound messages from the Hub and reply through the channel extension, not through shell scripts.
- Send concise replies that move the conversation forward.
- Use reactions when they communicate state more efficiently than a full message.
- Do not send both a reaction and a text reply if they convey the same thing.

## Message Handling

- When a new inbound message arrives, decide whether it needs a reply, a reaction, or both.
- If the message starts work, acknowledge it quickly, then continue with the task.
- If the reply will take time, update the message state so the UI reflects that work is in progress.
- When work is complete, send the result back to the same conversation.

## Reactions

- Use the `react` action for lightweight acknowledgements or completion signals.
- Provide the Hub `messageId` and the emoji to add or remove.
- Reactions should be meaningful and sparse, not noise on every message.

Example action payload:

```json
{
  "action": "react",
  "messageId": "123",
  "emoji": "👍",
  "channel": "swissclaw-hub"
}
```

## Good Defaults

- Prefer brief acknowledgment first when a user is waiting.
- Keep replies in the same conversation context.
- Avoid duplicate status chatter if the UI already shows message state transitions.
