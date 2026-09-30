import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDockHooks, dockHookEvent, encodedAgentCommand } from '../electron/dockHooks.mjs';

test('native turn events distinguish waiting, tool work, completion and background work', () => {
  assert.deepEqual(
    dockHookEvent({ type: 'agent-turn-complete', 'last-assistant-message': 'Pronto!' }),
    { state: 'success', content: 'Pronto!' },
  );
  assert.deepEqual(dockHookEvent({ hook_event_name: 'PermissionRequest' }), { state: 'waiting' });
  assert.deepEqual(dockHookEvent({ hook_event_name: 'PreToolUse' }), { state: 'working' });
  assert.deepEqual(dockHookEvent({ hook_event_name: 'StopFailure' }), { state: 'error' });
  assert.equal(dockHookEvent({ type: 'tool-complete' }), null);
  assert.deepEqual(
    dockHookEvent({
      hook_event_name: 'Stop',
      background_tasks: [{ status: 'running' }],
      last_assistant_message: 'Ainda trabalhando',
    }),
    { state: 'working' },
  );
});

test('completion is routed only to the owned session; hooks abstain from permission decisions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mesp-hook-'));
  const events = [];
  const bridge = await createDockHooks(dir, (event) => events.push(event));
  try {
    const args = bridge.prepare('mesp-a', 'claude', process.execPath);
    const file = args[1];
    const settings = JSON.parse(readFileSync(file, 'utf8'));
    const url = settings.hooks.Stop[0].hooks[0].url;
    const denied = await fetch(url.replace(/mesp\/.+/, 'mesp/unknown'), {
      method: 'POST',
      body: JSON.stringify({ hook_event_name: 'Stop' }),
    });
    assert.equal(denied.status, 404);
    assert.equal(events.length, 0);
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        hook_event_name: 'Stop',
        last_assistant_message: 'Resultado real',
      }),
    });
    assert.deepEqual(await response.json(), {});
    assert.deepEqual(events, [{ petId: 'mesp-a', state: 'success', content: 'Resultado real' }]);
    bridge.remove('mesp-a');
    assert.equal(existsSync(file), false);
    const stale = await fetch(url, { method: 'POST', body: '{}' });
    assert.equal(stale.status, 404);
  } finally {
    bridge.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('agent command encoding never evaluates argument text as PowerShell code', () => {
  const encoded = encodedAgentCommand('claude.cmd', ["C:\\Meu projeto's", '$(malicious); & cmd']);
  assert.equal(
    Buffer.from(encoded, 'base64').toString('utf16le'),
    "& 'claude.cmd' 'C:\\Meu projeto''s' '$(malicious); & cmd'",
  );
});
