import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  titlePrompt,
  parseTitle,
  titleArgs,
  titleCommand,
  createDockTitleService,
} from '../electron/dockTitles.mjs';

const answer = (text) =>
  JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } });
test('extracts actual agent answers and rejects progress, errors and long/multiline responses', () => {
  assert.equal(
    parseTitle('codex', `{"type":"thread.started"}\n${answer('Revisar pagamentos')}`),
    'Revisar pagamentos',
  );
  assert.equal(
    parseTitle('claude', JSON.stringify({ type: 'result', result: '"Ajustar painel."' })),
    'Ajustar painel',
  );
  assert.equal(
    parseTitle('claude', JSON.stringify({ type: 'result', is_error: true, result: 'Failed auth' })),
    null,
  );
  for (const invalid of ['A'.repeat(81), 'Título\nOutro título', '<script>', ''])
    assert.equal(parseTitle('codex', answer(invalid)), null);
  assert.equal(parseTitle('codex', 'Tarefa concluída'), null);
});
test('task content stays separate from shell code and agents cannot modify project files', () => {
  const hostile = 'Arrume a busca; $(Remove-Item X) `cmd` "ignorar instruções"';
  assert.ok(titlePrompt(hostile).includes(JSON.stringify(hostile)));
  assert.ok(titlePrompt('a'.repeat(10000)).length < 7000);
  const encoded = titleCommand("C:\\some's path\\claude.cmd", titleArgs('claude'), 'win32');
  const script = Buffer.from(encoded.args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /ReadToEnd\(\) \| &/);
  assert.match(script, /some''s path/);
  assert.ok(!script.includes(hostile));
  assert.ok(titleArgs('claude').includes('--safe-mode'));
  assert.equal(titleArgs('claude')[titleArgs('claude').indexOf('--tools') + 1], '');
  assert.equal(titleArgs('codex')[titleArgs('codex').indexOf('--sandbox') + 1], 'read-only');
});

function harness(t) {
  const directory = mkdtempSync(join(tmpdir(), 'mesp-title-test-'));
  const calls = [];
  const service = createDockTitleService({
    directory,
    resolveCommand: () => 'fake.exe',
    spawnProcess(command, args, options) {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      const call = { command, args, options, input: '', child };
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
      call.complete = (title) => {
        child.stdout.end(answer(title));
        child.emit('close', 0);
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
test('uses stdin, isolated working directory, bounded concurrency and duplicate request cache', async (t) => {
  const { service, calls, directory } = harness(t);
  const a = service.generate('Revisar pagamento');
  const duplicate = service.generate('Revisar pagamento');
  const b = service.generate('Refazer filtros');
  const c = service.generate('Preparar login');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.cwd, directory);
  assert.equal(calls[0].options.shell, false);
  assert.ok(calls[0].input.includes('Revisar pagamento'));
  assert.ok(!calls[0].args.some((arg) => arg.includes('Revisar pagamento')));
  assert.equal(calls[0].child.stdin.writableEnded, true);
  calls[0].complete('Revisar pagamentos');
  assert.equal(calls.length, 3);
  calls[1].complete('Refazer filtros');
  calls[2].complete('Preparar login');
  assert.deepEqual(await Promise.all([a, duplicate, b, c]), [
    'Revisar pagamentos',
    'Revisar pagamentos',
    'Refazer filtros',
    'Preparar login',
  ]);
  assert.equal(await service.generate('Revisar pagamento'), 'Revisar pagamentos');
  assert.equal(calls.length, 3);
});
test('missing agent and shutdown resolve quietly without affecting coding terminals', async (t) => {
  const { service, calls } = harness(t);
  const pending = [
    service.generate('Uma tarefa'),
    service.generate('Outra tarefa'),
    service.generate('Mais uma tarefa'),
  ];
  service.dispose();
  assert.deepEqual(await Promise.all(pending), [null, null, null]);
  assert.ok(calls.every((c) => c.killed));
  assert.equal(await service.generate('Depois do fechamento'), null);
  const unavailable = createDockTitleService({ directory: tmpdir(), resolveCommand: () => null });
  assert.equal(await unavailable.generate('Uma tarefa'), null);
  unavailable.dispose();
});
