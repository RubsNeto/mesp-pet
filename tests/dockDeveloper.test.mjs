import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  projectSnapshot,
  changedProjectFiles,
  inspectDeveloperProject,
  detectProjectManager,
  discoverDeveloperChecks,
  runDeveloperChecks,
  createDeveloperMemory,
  developerBrief,
  repairDeveloperPrompt,
  redactDeveloperText,
  deliveryMarkdown,
} from '../electron/dockDeveloper.mjs';
import {
  normalizeDeveloperReport,
  developerDeliveryText,
} from '../src/services/developerDelivery.mjs';
import {
  normalizeStoredMespMessages,
  normalizeStoredMespQueue,
} from '../src/services/mespCodeCore.mjs';
import { createDockProjectService } from '../electron/dockProjects.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mesp-developer-'));
  t.after(async () => {
    const target = resolve(root);
    assert.ok(
      target.startsWith(resolve(tmpdir()) + '\\') || target.startsWith(resolve(tmpdir()) + '/'),
    );
    await rm(target, { recursive: true, force: true });
  });
  return root;
}
const profile = (scripts = {}, files = []) => ({
  scripts,
  files,
  stacks: [],
  manager: { name: 'npm' },
});
const report = () => ({
  version: 1,
  project: 'C:/sample',
  status: 'passed',
  repairs: 1,
  durationMs: 2000,
  limited: false,
  files: [{ file: 'app.js', status: 'modified' }],
  checks: [{ name: 'test', status: 'passed', code: 0, output: '', durationMs: 100 }],
  skipped: [],
});

test('project manager honors declared version over conflicting lockfiles', () => {
  assert.deepEqual(
    detectProjectManager({ packageManager: 'pnpm@10.0.0' }, ['package-lock.json', 'yarn.lock']),
    { name: 'pnpm', conflict: true, declared: true },
  );
});
for (const [file, name] of [
  ['package-lock.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
])
  test(`discovers ${name} from ${file} without switching tools`, () =>
    assert.equal(detectProjectManager({}, [file]).name, name));

test('inspection reads instructions and stack while preserving project files', async (t) => {
  const root = await fixture(t);
  const pkg = {
    name: 'customer-project',
    packageManager: 'npm@11',
    engines: { node: '>=22' },
    dependencies: { react: '18' },
    scripts: { 'check:types': 'tsc --noEmit' },
  };
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg));
  await writeFile(join(root, 'AGENTS.md'), 'Preserve customer data.');
  await writeFile(join(root, 'README.md'), 'Setup instructions');
  const result = await inspectDeveloperProject(root);
  assert.deepEqual(result.stacks, ['react']);
  assert.equal(result.engines.node, '>=22');
  assert.ok(developerBrief(result).includes('Preserve customer data.'));
  assert.equal(await readFile(join(root, 'package.json'), 'utf8'), JSON.stringify(pkg));
});

test('snapshot excludes credentials, build outputs and junction targets', async (t) => {
  const root = await fixture(t),
    external = await fixture(t);
  await writeFile(join(root, 'app.js'), 'old content');
  await writeFile(join(root, '.env'), 'TOKEN=private');
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist', 'generated.js'), 'generated');
  await writeFile(join(external, 'foreign.txt'), 'external');
  await symlink(external, join(root, 'external'), 'junction');
  assert.deepEqual(Object.keys((await projectSnapshot(root)).files), ['app.js']);
});

test('baseline detects actual bytes changed, additions and deletions', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'app.js'), 'v1');
  await writeFile(join(root, 'removed.txt'), 'exists');
  const before = await projectSnapshot(root);
  await writeFile(join(root, 'app.js'), 'v2');
  await writeFile(join(root, 'new.txt'), 'new');
  await rm(join(root, 'removed.txt'));
  assert.deepEqual(changedProjectFiles(before, await projectSnapshot(root)), [
    { file: 'app.js', status: 'modified' },
    { file: 'new.txt', status: 'added' },
    { file: 'removed.txt', status: 'deleted' },
  ]);
});

test('bounded inspection never calls an unobserved file deleted', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'first.txt'), 'first');
  await writeFile(join(root, 'second.txt'), 'second');
  const before = await projectSnapshot(root),
    after = await projectSnapshot(root, { maxFiles: 1 });
  assert.equal(after.truncated, true);
  assert.equal(
    changedProjectFiles(before, after).some((file) => file.status === 'deleted'),
    false,
  );
});

test('large projects stay within the total inspection byte budget', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'large.js'), 'X'.repeat(600));
  await writeFile(join(root, 'small.js'), 'x');
  const snapshot = await projectSnapshot(root, { maxBytes: 500 });
  assert.equal(snapshot.truncated, true);
  assert.ok(snapshot.bytes <= 500);
  assert.deepEqual(Object.keys(snapshot.files), ['small.js']);
});

test('discovers CI aliases, syntax checks and protects publication scripts', () => {
  const detected = discoverDeveloperChecks(
    profile(
      {
        'type-check': 'tsc --noEmit',
        'lint:check': 'eslint .',
        'test:run': 'vitest run',
        test: 'vitest --watch',
        check: 'node verify.cjs',
        build: 'vite build && npm publish',
      },
      ['server.cjs', 'calc.py'],
    ),
  );
  assert.deepEqual(
    detected.checks.map((check) => check.name),
    ['typecheck', 'lint', 'test', 'check', 'Sintaxe: server.cjs', 'Sintaxe: calc.py'],
  );
  assert.equal(detected.skipped[0].name, 'build');
});

test('watch and dev scripts cannot hang the independent verification', () => {
  const result = discoverDeveloperChecks(
    profile({ test: 'node --test --watch', build: 'vite dev' }),
  );
  assert.equal(result.checks.length, 0);
  assert.equal(result.skipped.length, 2);
});

test('transpiled React JS is left to its build instead of invalid Node parsing', () => {
  const result = discoverDeveloperChecks({
    ...profile({}, ['src/component.js', 'server.cjs']),
    stacks: ['react'],
  });
  assert.deepEqual(
    result.checks.map((check) => check.file),
    ['server.cjs'],
  );
});

test('independent verification stops on failure with real failure output', async () => {
  const executed = [];
  const result = await runDeveloperChecks(
    profile({ lint: 'eslint .', test: 'node --test', build: 'vite build' }),
    {
      signal: new AbortController().signal,
      deadline: Date.now() + 10000,
      execute: async (check) => {
        executed.push(check.name);
        return { code: 1, output: 'assertion failed' };
      },
    },
  );
  assert.deepEqual(executed, ['lint']);
  assert.equal(result.passed, false);
  assert.equal(result.results[0].output, 'assertion failed');
  assert.deepEqual(
    result.skipped.map((check) => check.name),
    ['test', 'build'],
  );
});

test('cancelled verification executes no commands and cannot claim passed', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runDeveloperChecks(profile({ test: 'node --test' }), {
    signal: controller.signal,
    deadline: Date.now() + 1000,
    execute: async () => assert.fail('Must not execute'),
  });
  assert.equal(result.passed, false);
  assert.equal(result.results.length, 0);
});

test('task deadline is shared by checks rather than reset for each script', async () => {
  const result = await runDeveloperChecks(profile({ test: 'node --test' }), {
    signal: new AbortController().signal,
    deadline: Date.now() - 1,
    execute: async () => assert.fail('Must not execute'),
  });
  assert.equal(result.passed, false);
  assert.match(result.results[0].output, /limite total/);
});

test('missing runtimes are recorded as skipped rather than successful tests', async () => {
  const result = await runDeveloperChecks(profile({}, ['calc.py']), {
    signal: new AbortController().signal,
    deadline: Date.now() + 1000,
    execute: async () => ({ code: null, skipped: true, output: 'Python unavailable' }),
  });
  assert.equal(result.results[0].status, 'skipped');
  assert.notEqual(result.results[0].status, 'passed');
});

test('memory survives reopening and remains isolated per project', async (t) => {
  const root = await fixture(t);
  await createDeveloperMemory(root).write('project-a', { ...report(), summary: 'Task A' });
  await createDeveloperMemory(root).write('project-b', { ...report(), summary: 'Task B' });
  const memory = createDeveloperMemory(root);
  assert.equal((await memory.read('project-a')).summary, 'Task A');
  assert.equal((await memory.read('project-b')).summary, 'Task B');
  assert.equal(await memory.read('project-c'), null);
});

test('memory recovers from corrupt state and uses complete atomic documents', async (t) => {
  const root = await fixture(t);
  const memory = createDeveloperMemory(root);
  await Promise.all([
    memory.write('a', report()),
    memory.write('a', { ...report(), status: 'failed' }),
  ]);
  assert.ok(['passed', 'failed'].includes((await memory.read('a')).status));
  const { readdir } = await import('node:fs/promises');
  const saved = (await readdir(root)).find((name) => name.endsWith('.json'));
  await writeFile(join(root, saved), '{corrupt state');
  assert.equal(await memory.read('a'), null);
});

test('repair includes diagnostic evidence and forbids weakening tests', () => {
  const prompt = repairDeveloperPrompt('Fix checkout', 'Assertion failed', 1);
  assert.match(prompt, /Assertion failed/);
  assert.match(prompt, /Não desative, apague ou enfraqueça testes/);
});

test('secrets and embedded URL credentials stay out of delivery memory', async (t) => {
  const root = await fixture(t);
  const source = 'api_key=very-private https://user:pass@example.com sk-0123456789abcdef';
  assert.ok(!redactDeveloperText(source).includes('very-private'));
  await createDeveloperMemory(root).write('project', { ...report(), summary: source });
  const saved = await createDeveloperMemory(root).read('project');
  assert.ok(!saved.summary.includes('user:pass'));
  assert.ok(!saved.summary.includes('0123456789abcdef'));
});

test('delivery is persisted together with chat and can be copied after restart', () => {
  const saved = normalizeStoredMespMessages([
    {
      id: 'reply',
      role: 'assistant',
      text: 'Done',
      status: 'done',
      delivery: report(),
      requestId: 'run-1',
    },
  ])[0];
  assert.equal(saved.delivery.checks[0].code, 0);
  assert.equal(saved.requestId, 'run-1');
  assert.match(developerDeliveryText(saved.delivery), /app.js/);
});

test('invalid delivery data cannot inject states or unbounded content', () => {
  assert.equal(normalizeDeveloperReport({ ...report(), status: 'invented' }), undefined);
  const normalized = normalizeDeveloperReport({
    ...report(),
    repairs: 99,
    checks: [{ name: 'test', status: 'passed', output: 'x'.repeat(30000), code: 0 }],
  });
  assert.equal(normalized.repairs, 2);
  assert.equal(normalized.checks[0].output.length, 12000);
});

test('queue retains the model-classified intent across restart', () => {
  const intent = { action: 'execute', workspace: 'existing', web: true };
  const queue = normalizeStoredMespQueue([
    {
      id: 'task',
      prompt: 'Pode seguir',
      mode: 'fast',
      model: '9router/mesp/auto',
      cwd: 'project',
      limits: {},
      intent,
    },
  ]);
  assert.deepEqual(queue[0].intent, intent);
});

test('export includes incomplete coverage instead of presenting it as a passed test', () => {
  const text = deliveryMarkdown({
    ...report(),
    limited: true,
    skipped: [{ name: 'browser test', reason: 'Needs credentials' }],
  });
  assert.match(text, /não executado/);
  assert.match(text, /não representa todo o disco/);
});

test('compiled SPA deep links work while missing assets and private routes stay blocked', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist', 'index.html'), '<title>SPA</title>');
  const service = createDockProjectService({ directory: root });
  t.after(() => service.dispose());
  const preview = await service.preview(root);
  const nested = new URL(preview.url);
  nested.pathname = '/customers/42';
  const response = await fetch(nested, { headers: { accept: 'text/html' } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /SPA/);
  nested.pathname = '/missing.js';
  assert.equal((await fetch(nested)).status, 404);
  nested.pathname = '/.env';
  assert.equal((await fetch(nested)).status, 404);
  nested.pathname = '/customers/42';
  nested.search = '';
  assert.equal((await fetch(nested, { headers: { accept: 'text/html' } })).status, 404);
});

test('unquoted HTML resources are validated before opening a broken preview', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, 'index.html'),
    '<link rel=stylesheet href=missing.css><script src=missing.js></script>',
  );
  const service = createDockProjectService({ directory: root });
  t.after(() => service.dispose());
  const preview = await service.preview(root);
  assert.equal(preview.ok, false);
  assert.match(preview.error, /missing.css/);
});

test('invalid package JSON remains diagnosable and is included in verification', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'package.json'), 'null');
  const inspected = await inspectDeveloperProject(root);
  assert.match(inspected.warnings[0], /package.json inválido/);
  assert.equal(discoverDeveloperChecks(inspected).checks[0].kind, 'json');
});

test('large lockfiles still select the correct manager without reading their content', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'pnpm-lock.yaml'), 'x'.repeat(1_100_000));
  const inspected = await inspectDeveloperProject(root);
  assert.equal(inspected.manager.name, 'pnpm');
  assert.equal(inspected.snapshot.truncated, true);
  assert.equal(inspected.snapshot.files['pnpm-lock.yaml'], undefined);
});
