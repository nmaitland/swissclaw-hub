#!/usr/bin/env npx ts-node
import { HubApiClient } from './lib/hub-api-client';
import { ensureHubAuth } from './lib/hub-auth';
import { getStringFlag, hasFlag, parseArgs } from './lib/args';
import { printOutput } from './lib/output';

const usage = (): string => `
Usage: npx ts-node scripts/hub-api.ts <group> <command> [options]

Groups and commands:
  auth login [--force]
  chat send --message "..." [--sender "..."]
  chat state --id <messageId> --state <received|processing|thinking|responded>
  chat list [--limit <n>] [--before <iso-datetime>]
  status set --state <active|busy|idle> --task "..." [--last-active <iso-datetime>]
  model-usage put --usage-date YYYY-MM-DD --updated-at <iso-datetime> --models-json '[...]'
  model-usage get --date YYYY-MM-DD
  model-usage history [--start-date YYYY-MM-DD] [--limit <n>]
  activities add --type "..." --description "..." [--sender "..."] [--metadata-json '{...}']
  activities list [--limit <n>] [--before <iso-datetime>]
  kanban board
  kanban list [--column <name>]
  kanban create --title "..." [--description "..."] [--column <name>] [--priority <low|medium|high>]
  kanban update --id <id> --data-json '{...}'
  kanban move --id <id> --column <name>
  kanban delete --id <id>

Global:
  --json      Output JSON
  --help      Show help
`;

const parseJson = (value: string, flagName: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON for --${flagName}`);
  }
};

const requireFlag = (flags: Map<string, string | boolean>, name: string): string => {
  const value = getStringFlag(flags, name);
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
};

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  const { positional, flags } = parseArgs(argv);
  const asJson = hasFlag(flags, 'json');

  if (hasFlag(flags, 'help') || positional.length < 2) {
    printOutput(usage(), false);
    return;
  }

  const [group, command] = positional;
  if (!group || !command) {
    printOutput(usage(), false);
    return;
  }

  if (group === 'auth' && command === 'login') {
    const token = await ensureHubAuth(hasFlag(flags, 'force'));
    printOutput({ success: true, tokenPreview: `${token.slice(0, 6)}...` }, asJson);
    return;
  }

  const client = await HubApiClient.create(hasFlag(flags, 'force'));

  if (group === 'chat' && command === 'send') {
    const message = requireFlag(flags, 'message');
    const sender = getStringFlag(flags, 'sender') || 'Swissclaw';
    const result = await client.request('/api/service/messages', {
      method: 'POST',
      body: { sender, content: message },
    });
    printOutput(result, asJson);
    return;
  }

  if (group === 'chat' && command === 'state') {
    const id = requireFlag(flags, 'id');
    const state = requireFlag(flags, 'state');
    const result = await client.request(`/api/service/messages/${id}/state`, {
      method: 'PUT',
      body: { state },
    });
    printOutput(result, asJson);
    return;
  }

  if (group === 'chat' && command === 'list') {
    const params = new URLSearchParams();
    const limit = getStringFlag(flags, 'limit');
    const before = getStringFlag(flags, 'before');
    if (limit) params.set('limit', limit);
    if (before) params.set('before', before);
    const query = params.toString();
    const result = await client.request(`/api/messages${query ? `?${query}` : ''}`);
    printOutput(result, asJson);
    return;
  }

  if (group === 'status' && command === 'set') {
    const state = requireFlag(flags, 'state');
    const currentTask = requireFlag(flags, 'task');
    const lastActive = getStringFlag(flags, 'last-active') || new Date().toISOString();
    const result = await client.request('/api/service/status', {
      method: 'PUT',
      body: { state, currentTask, lastActive },
    });
    printOutput(result, asJson);
    return;
  }

  if (group === 'model-usage' && command === 'put') {
    const usageDate = requireFlag(flags, 'usage-date');
    const updatedAt = requireFlag(flags, 'updated-at');
    const modelsJson = requireFlag(flags, 'models-json');
    const models = parseJson(modelsJson, 'models-json');
    const result = await client.request('/api/service/model-usage', {
      method: 'PUT',
      body: { usageDate, updatedAt, models },
    });
    printOutput(result, asJson);
    return;
  }

  if (group === 'model-usage' && command === 'get') {
    const date = requireFlag(flags, 'date');
    const result = await client.request(`/api/model-usage?date=${encodeURIComponent(date)}`);
    printOutput(result, asJson);
    return;
  }

  if (group === 'model-usage' && command === 'history') {
    const params = new URLSearchParams();
    const startDate = getStringFlag(flags, 'start-date');
    const limit = getStringFlag(flags, 'limit');
    if (startDate) params.set('startDate', startDate);
    if (limit) params.set('limit', limit);
    const query = params.toString();
    const result = await client.request(`/api/model-usage${query ? `?${query}` : ''}`);
    printOutput(result, asJson);
    return;
  }

  if (group === 'activities' && command === 'add') {
    const type = requireFlag(flags, 'type');
    const description = requireFlag(flags, 'description');
    const sender = getStringFlag(flags, 'sender');
    const metadataJson = getStringFlag(flags, 'metadata-json');
    const metadata = metadataJson ? parseJson(metadataJson, 'metadata-json') : {};
    const result = await client.request('/api/service/activities', {
      method: 'POST',
      body: { type, description, sender, metadata },
    });
    printOutput(result, asJson);
    return;
  }

  if (group === 'activities' && command === 'list') {
    const params = new URLSearchParams();
    const limit = getStringFlag(flags, 'limit');
    const before = getStringFlag(flags, 'before');
    if (limit) params.set('limit', limit);
    if (before) params.set('before', before);
    const query = params.toString();
    const result = await client.request(`/api/activities${query ? `?${query}` : ''}`);
    printOutput(result, asJson);
    return;
  }

  if (group === 'kanban' && command === 'board') {
    const result = await client.request('/api/kanban');
    printOutput(result, asJson);
    return;
  }

  if (group === 'kanban' && command === 'list') {
    const column = getStringFlag(flags, 'column');
    const board = await client.request('/api/kanban') as { tasks?: Record<string, unknown[]> };
    if (!column) {
      printOutput(board, asJson);
      return;
    }
    const tasks = board.tasks?.[column] || [];
    printOutput(tasks, asJson);
    return;
  }

  if (group === 'kanban' && command === 'create') {
    const title = requireFlag(flags, 'title');
    const description = getStringFlag(flags, 'description') || '';
    const columnName = getStringFlag(flags, 'column') || 'backlog';
    const priority = getStringFlag(flags, 'priority') || 'medium';
    const result = await client.request('/api/kanban/tasks', {
      method: 'POST',
      body: { title, description, columnName, priority },
    });
    printOutput(result, asJson);
    return;
  }

  if (group === 'kanban' && command === 'update') {
    const id = requireFlag(flags, 'id');
    const dataJson = requireFlag(flags, 'data-json');
    const data = parseJson(dataJson, 'data-json');
    const result = await client.request(`/api/kanban/tasks/${id}`, {
      method: 'PUT',
      body: data,
    });
    printOutput(result, asJson);
    return;
  }

  if (group === 'kanban' && command === 'move') {
    const id = requireFlag(flags, 'id');
    const columnName = requireFlag(flags, 'column');
    const result = await client.request(`/api/kanban/tasks/${id}`, {
      method: 'PUT',
      body: { columnName },
    });
    printOutput(result, asJson);
    return;
  }

  if (group === 'kanban' && command === 'delete') {
    const id = requireFlag(flags, 'id');
    const result = await client.request(`/api/kanban/tasks/${id}`, {
      method: 'DELETE',
    });
    printOutput(result, asJson);
    return;
  }

  throw new Error(`Unknown command: ${group} ${command}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
