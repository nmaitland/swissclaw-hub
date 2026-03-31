# Swissclaw Hub — OpenClaw Channel Extension

An [OpenClaw](https://openclaw.ai) channel plugin that connects your AI agent to [Swissclaw Hub](../README.md) chat via Socket.io.

Inbound messages from the Hub are dispatched to your agent. Replies, reactions, and message state updates are sent back in real time.

## Prerequisites

- OpenClaw installed and running
- A Swissclaw Hub instance (see [deployment guide](../README.md))

## Installation

From the `dashboard/` directory (or wherever you have cloned this repo):

```bash
openclaw plugins install ./openclaw-extension
```

For development, use `--link` so edits take effect without reinstalling:

```bash
openclaw plugins install --link ./openclaw-extension
```

Then install the plugin's dependencies:

```bash
cd openclaw-extension && npm install
```

## Configuration

Add the following to your OpenClaw config file:

```json
{
  "channels": {
    "swissclaw-hub": {
      "url": "https://your-hub.example.com"
    }
  }
}
```

Alternatively, set the `HUB_URL` environment variable.

## Example Agent Instructions

If you want to give an agent explicit operating guidance for this extension, see the examples in [`examples/`](examples/):

- [`examples/hub-chat.md`](examples/hub-chat.md): real-time chat handling, replies, reactions, and message-state updates
- [`examples/kanban.md`](examples/kanban.md): task-board workflow and column movement rules
- [`examples/status.md`](examples/status.md): status panel updates during active work

These are intentionally de-personalised so they can be copied into another workspace and adapted.

## Authentication

The extension logs in to the Hub using a username and password, then caches the session token at `~/.swissclaw-token`.

Credentials are resolved in this order:

1. **Credential provider script** — the extension runs `openclaw config get agents.defaults.workspace` at startup to locate your workspace, then looks for `<workspace>/.openclaw/credentials/swissclaw-hub.ts`. If found, its `getCredentials()` method is called. This lets you integrate with any secrets manager. See [Credential Provider](#credential-provider) below.
2. **Environment variables** — `SWISSCLAW_USERNAME` and `SWISSCLAW_PASSWORD`.

If neither is configured, the extension will throw a descriptive error on startup.

### Credential Provider

Create `<workspace>/.openclaw/credentials/swissclaw-hub.ts` (where `<workspace>` is the output of `openclaw config get agents.defaults.workspace`) exporting a default object that implements:

```typescript
interface CredentialProvider {
  getCredentials(): Promise<{ username: string; password: string }>;
}
```

Example using environment variables (same as the built-in fallback, useful as a starting template):

```typescript
export default {
  getCredentials() {
    return Promise.resolve({
      username: process.env.SWISSCLAW_USERNAME!,
      password: process.env.SWISSCLAW_PASSWORD!,
    });
  },
};
```

## Running Tests

```bash
cd dashboard
npm test -- --testPathPattern=openclaw-extension
```
