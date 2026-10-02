import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createDockChatService,
  conversationArgs,
  conversationPrompt,
  parseConversation,
} from '../electron/dockChat.mjs';

function harness(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'mesp-conversation-'));
  const calls = [];
  const service = createDockChatService({
    directory,
    resolveCommand: (agent) => `${agent}.exe`,
    ...options,
    spawnProcess(command, args, config) {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      const call = { command, args, config, child, input: '', killed: false };
      child.stdin = new Writable({
        write(chunk, _encoding, done) {
          call.input += chunk;
          done();
        },
      });
      child.kill = () => {
        call.killed = true;
        child.emit('close', 1);
      };
      call.complete = (result, code = 0) => {
        child.stdout.end(
          command === 'claude.exe'
            ? JSON.stringify({ type: 'result', structured_output: result })
            : JSON.stringify({
                type: 'item.completed',
                item: { type: 'agent_message', text: JSON.stringify(result) },
              }),
        );
        child.emit('close', code);
      };
      calls.push(call);
      return child;
    },
  });
  t.after(() => {
    service.dispose();
    rmSync(directory, { recursive: true, force: true });
  });
  return { service, calls, directory };
}
const request = (petId, agent = 'codex') => ({ petId, agent, prompt: 'oi', history: [] });

test('a real general answer and a request for project access have distinct structured results', () => {
  assert.deepEqual(parseConversation('{"answer":"Olá! Como posso ajudar?","needsProject":false}'), {
    answer: 'Olá! Como posso ajudar?',
    needsProject: false,
  });
  assert.deepEqual(
    parseConversation({
      answer: 'Preciso ler os arquivos para corrigir o erro.',
      needsProject: true,
    }),
    { answer: 'Preciso ler os arquivos para corrigir o erro.', needsProject: true },
  );
  for (const invalid of [
    'plain text',
    { answer: 'Olá' },
    { answer: '', needsProject: false },
    { answer: 'Olá', needsProject: 'false' },
    { answer: 'a'.repeat(64001), needsProject: true },
  ])
    assert.equal(parseConversation(invalid), null);
});
test('conversation history is bounded and generic questions do not require a repository', () => {
  const input = conversationPrompt(
    'oi',
    Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `pergunta ${i}` })),
  );
  const history = JSON.parse(input.split('\n').at(-1));
  assert.equal(history.length, 11);
  assert.equal(history[0].content, 'pergunta 20');
  assert.equal(history.at(-1).content, 'oi');
  assert.match(input, /Não peça um repositório para conversar/);
  assert.ok(
    conversationPrompt('oi', [{ role: 'assistant', content: 'x'.repeat(50000) }]).length < 15000,
  );
});
test('queries stay in an isolated directory, tools are disabled and prompts stay off command lines', async (t) => {
  const { service, calls, directory } = harness(t);
  const hostile = 'Explique $(Remove-Item X) e `cmd`; não execute.';
  const pending = service.reply({ ...request('blue'), prompt: hostile });
  assert.equal(calls[0].config.cwd, directory);
  assert.equal(calls[0].config.shell, false);
  assert.equal(calls[0].config.windowsHide, true);
  assert.ok(!calls[0].args.some((arg) => arg.includes(hostile)));
  assert.ok(calls[0].input.includes(hostile));
  assert.ok(calls[0].args.includes('shell_tool'));
  assert.ok(calls[0].args.includes('--ignore-user-config'));
  const args = conversationArgs('claude', 'schema');
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.ok(args.includes('--safe-mode'));
  assert.ok(args.includes('--strict-mcp-config'));
  calls[0].complete({ answer: 'Posso explicar sem executar comandos.', needsProject: false });
  assert.equal((await pending).ok, true);
});
test('each MESP uses its chosen agent, simultaneous replies and cancellation stay independent', async (t) => {
  const { service, calls } = harness(t);
  const a = service.reply(request('blue'));
  const b = service.reply(request('green', 'claude'));
  assert.equal(calls[1].command, 'claude.exe');
  assert.equal((await service.reply(request('blue'))).ok, false);
  assert.equal(service.activeCount, 2);
  assert.equal(service.cancel('blue'), true);
  assert.equal((await a).ok, false);
  assert.equal(calls[1].killed, false);
  calls[1].complete({ answer: 'Resposta do Claude.', needsProject: false });
  assert.equal((await b).answer, 'Resposta do Claude.');
  assert.equal(service.activeCount, 0);
});
test('failed login output is never passed to the renderer and no other account is silently substituted', async (t) => {
  const { service, calls } = harness(t);
  const a = service.reply(request('blue'));
  calls[0].child.stderr.write('authentication failed: private-token-example');
  calls[0].complete({ answer: 'private-token-example', needsProject: false }, 1);
  const result = await a;
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes('private-token-example'));
  const missing = createDockChatService({ directory: tmpdir(), resolveCommand: () => null });
  assert.equal((await missing.reply(request('blue', 'claude'))).ok, false);
  missing.dispose();
});
test('shutdown and timeout finish pending replies and only stop their own processes', async (t) => {
  const { service, calls } = harness(t, { timeoutMs: 25 });
  const pending = service.reply(request('blue'));
  // Keep the test process alive while the service's unref'ed timer runs.
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal((await pending).ok, false);
  assert.equal(calls[0].killed, true);
  const b = service.reply(request('green'));
  service.dispose();
  assert.equal((await b).ok, false);
  assert.equal(calls[1].killed, true);
});
