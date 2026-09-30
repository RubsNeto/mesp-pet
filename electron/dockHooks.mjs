import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

const text = (value) => (typeof value === 'string' ? value.slice(0, 24000) : '');
export function dockHookEvent(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.type === 'agent-turn-complete')
    return { state: 'success', content: text(payload['last-assistant-message']) };
  switch (payload.hook_event_name) {
    case 'UserPromptSubmit':
      return { state: 'thinking', prompt: text(payload.prompt) };
    case 'PreToolUse':
      return { state: 'working' };
    case 'PermissionRequest':
      return { state: 'waiting' };
    case 'StopFailure':
      return { state: 'error' };
    case 'Stop': {
      const background = payload.background_tasks;
      if (
        Array.isArray(background) &&
        background.some(
          (task) => !['completed', 'failed', 'cancelled', 'stopped'].includes(task?.status),
        )
      )
        return { state: 'working' };
      return { state: 'success', content: text(payload.last_assistant_message) };
    }
    default:
      return null;
  }
}

// The helper is invoked by Codex only after a turn. It never talks to a remote API.
const notifySource = `const http = require('node:http');
try {
  const data = process.argv[process.argv.length - 1];
  const request = http.request(process.argv[2], { method: 'POST', timeout: 800,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    response => response.resume());
  request.on('error', () => {});
  request.on('timeout', () => request.destroy());
  request.end(data);
} catch { /* Notification failure must never interrupt the coding agent. */ }
`;

/** A private, temporary hook per owned terminal. No global agent settings are edited. */
export async function createDockHooks(directory, send) {
  const sessions = new Map();
  mkdirSync(directory, { recursive: true });
  const notifyPath = join(directory, 'notify.cjs');
  writeFileSync(notifyPath, notifySource);
  const server = createServer((request, response) => {
    const session = sessions.get(request.url);
    if (request.method !== 'POST' || !session) {
      response.writeHead(404).end();
      return;
    }
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 128000) {
        response.writeHead(413).end();
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => {
      // Always abstain from approval/blocking decisions; Claude keeps its own permissions.
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
      try {
        const event = dockHookEvent(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        if (event && sessions.get(request.url) === session)
          send({ petId: session.petId, ...event });
      } catch {
        /* Invalid or stale events are ignored. */
      }
    });
    request.on('error', () => {});
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  server.unref();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const remove = (petId) => {
    for (const [route, session] of sessions)
      if (session.petId === petId) {
        sessions.delete(route);
        if (session.file)
          try {
            unlinkSync(session.file);
          } catch {
            /* Already gone. */
          }
      }
  };
  return {
    prepare(petId, agent, nodeBinary) {
      remove(petId);
      const route = `/mesp/${randomBytes(24).toString('hex')}`;
      const session = { petId, file: null };
      sessions.set(route, session);
      const url = origin + route;
      if (agent === 'codex') {
        // TOML literal strings retain Windows backslashes and survive .cmd quoting.
        const literal = (value) => (value.includes("'") ? JSON.stringify(value) : `'${value}'`);
        return ['-c', `notify=[${[nodeBinary, notifyPath, url].map(literal).join(',')}]`];
      }
      const file = join(directory, `${petId}.json`);
      const hooks = Object.fromEntries(
        ['UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'Stop', 'StopFailure'].map(
          (event) => [event, [{ hooks: [{ type: 'http', url, timeout: 2 }] }]],
        ),
      );
      writeFileSync(file, JSON.stringify({ hooks }));
      session.file = file;
      return ['--settings', file];
    },
    remove,
    close() {
      for (const session of [...sessions.values()]) remove(session.petId);
      server.close();
    },
  };
}

/** Powershell's encoded command preserves JSON/TOML argv through Windows .cmd shims. */
export function encodedAgentCommand(command, args) {
  const quoted = (value) => `'${value.replace(/'/g, "''")}'`;
  return Buffer.from(`& ${[command, ...args].map(quoted).join(' ')}`, 'utf16le').toString('base64');
}
