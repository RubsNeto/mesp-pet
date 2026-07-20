import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTokenUsage,
  buildFastMessages,
  buildOpenCodeArgs,
  createBoundedProjectCheckOutput,
  discoverProjectChecks,
  enqueueUniqueTask,
  extractOpenCodeApiCredential,
  extractSSEData,
  hasActiveRouterConnections,
  isMespCodeMode,
  isLoopbackRouterURL,
  modelIdFor9Router,
  normalizeProjectChecks,
  normalizeStoredMespMessages,
  normalizeStoredMespQueue,
  parseDotEnvValue,
  parseOpenAIStreamData,
  projectCheckFinalState,
  publicOpenCodeEvent,
  resolveOpenCodeConfigValue,
  routerOriginForApiBase,
  shouldPauseQueueAfterVerification,
  takeNextQueuedTask,
  tokenUsageFromOpenCodeEvent,
  totalTokensFromUsage,
} from '../src/services/mespCodeCore.mjs';

test('accepts only supported MESP modes', () => {
  assert.equal(isMespCodeMode('fast'), true);
  assert.equal(isMespCodeMode('plan'), true);
  assert.equal(isMespCodeMode('assisted'), true);
  assert.equal(isMespCodeMode('autonomous'), true);
  assert.equal(isMespCodeMode('build'), false);
});

test('resolves OpenCode env references without accepting malformed placeholders', () => {
  const environment = { NINEROUTER_API_KEY: '  configured-value  ' };
  assert.equal(
    resolveOpenCodeConfigValue('{env:NINEROUTER_API_KEY}', environment),
    'configured-value',
  );
  assert.equal(resolveOpenCodeConfigValue('literal-value', environment), 'literal-value');
  assert.equal(resolveOpenCodeConfigValue('{env:MISSING}', environment), null);
  assert.equal(resolveOpenCodeConfigValue('{env:lowercase}', environment), null);
  assert.equal(resolveOpenCodeConfigValue('   ', environment), null);
  assert.equal(resolveOpenCodeConfigValue(null, environment), null);
});

test('parses quoted dotenv values without retaining quotes or inline comments', () => {
  assert.equal(parseDotEnvValue('  "safe value"  '), 'safe value');
  assert.equal(parseDotEnvValue("'literal value'"), 'literal value');
  assert.equal(parseDotEnvValue('plain-value # note'), 'plain-value');
  assert.equal(parseDotEnvValue('"line\\nvalue"'), 'line\nvalue');
  assert.equal(parseDotEnvValue(null), '');
});

test('accepts only local HTTP router URLs for the integrated runtime', () => {
  assert.equal(isLoopbackRouterURL('http://127.0.0.1:20127/v1'), true);
  assert.equal(isLoopbackRouterURL('http://localhost:20128/v1/'), true);
  assert.equal(isLoopbackRouterURL('https://[::1]:20127/v1'), true);
  assert.equal(isLoopbackRouterURL('http://192.168.0.10:20127/v1'), false);
  assert.equal(isLoopbackRouterURL('file:///tmp/router'), false);
  assert.equal(isLoopbackRouterURL('not-a-url'), false);
  assert.equal(routerOriginForApiBase('http://127.0.0.1:20127/v1'), 'http://127.0.0.1:20127');
  assert.equal(routerOriginForApiBase('https://router.example/v1'), null);
});

test('detects whether the integrated router still needs a provider', () => {
  assert.equal(hasActiveRouterConnections({ connections: [] }), false);
  assert.equal(hasActiveRouterConnections({ connections: [{ id: 'one', isActive: false }] }), false);
  assert.equal(hasActiveRouterConnections({ connections: [{ id: 'one', isActive: true }] }), true);
  assert.equal(hasActiveRouterConnections({ connections: [{ id: 'legacy' }] }), true);
  assert.equal(hasActiveRouterConnections({}), null);
  assert.equal(hasActiveRouterConnections(null), null);
});

test('extracts only API credentials for the requested OpenCode provider', () => {
  const value = 'x'.repeat(16);
  const auth = {
    '9router': { type: 'api', key: `  ${value}  ` },
    oauth: { type: 'oauth', access: value },
  };
  assert.equal(extractOpenCodeApiCredential(auth, '9router'), value);
  assert.equal(extractOpenCodeApiCredential(auth, 'oauth'), null);
  assert.equal(extractOpenCodeApiCredential('{broken', '9router'), null);
  assert.equal(extractOpenCodeApiCredential({}, '9router'), null);
});

test('assisted mode is handled by the approval server instead of CLI auto mode', () => {
  assert.throws(
    () =>
      buildOpenCodeArgs({
        prompt: 'implemente com aprovacao',
        model: '9router/cx/gpt-5.4',
        mode: 'assisted',
      }),
    /plan or autonomous/,
  );
});

test('plan mode uses the read-only MESP agent', () => {
  const args = buildOpenCodeArgs({
    prompt: 'analise',
    model: '9router/cx/gpt-5.4',
    mode: 'plan',
  });
  assert.deepEqual(args.slice(0, 7), [
    'run',
    '--format',
    'json',
    '--model',
    '9router/cx/gpt-5.4',
    '--agent',
    'mesp-plan',
  ]);
  assert.equal(args.includes('--auto'), false);
  assert.equal(args.at(-1), 'analise');
});

test('autonomous mode opts into full automatic permissions', () => {
  const args = buildOpenCodeArgs({
    prompt: 'implemente',
    model: '9router/cx/gpt-5.4',
    mode: 'autonomous',
    sessionId: 'ses_valid',
  });
  assert.equal(args[args.indexOf('--agent') + 1], 'mesp-autonomous');
  assert.equal(args.includes('--auto'), true);
  assert.equal(args[args.indexOf('--session') + 1], 'ses_valid');
  assert.equal(args.includes('--title'), false);
});

test('fast mode keeps only recent bounded history', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `message-${index}`,
  }));
  const messages = buildFastMessages(history, 'agora', { maxMessages: 4, maxChars: 200 });
  assert.equal(messages[0].role, 'system');
  assert.deepEqual(
    messages.slice(1, -1).map((item) => item.content),
    ['message-8', 'message-9', 'message-10', 'message-11'],
  );
  assert.deepEqual(messages.at(-1), { role: 'user', content: 'agora' });
});

test('parses OpenAI-compatible streaming text and usage', () => {
  const parsed = parseOpenAIStreamData(
    JSON.stringify({
      choices: [{ delta: { content: 'ola' }, finish_reason: null }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    }),
  );
  assert.equal(parsed.text, 'ola');
  assert.equal(totalTokensFromUsage(parsed.usage), 12);
  assert.equal(parseOpenAIStreamData('[DONE]').done, true);
  assert.equal(modelIdFor9Router('9router/kr/qwen3-coder-next'), 'kr/qwen3-coder-next');
});

test('extracts fragmented and multiline SSE events without losing the tail', () => {
  const first = extractSSEData('data: {"delta":"ola"}\n\ndata: {"delta":');
  assert.deepEqual(first.data, ['{"delta":"ola"}']);
  assert.equal(first.remainder, 'data: {"delta":');

  const second = extractSSEData(`${first.remainder}" mundo"}\ndata: \n\n`, true);
  assert.deepEqual(second.data, ['{"delta":" mundo"}\n']);
  assert.equal(second.remainder, '');
});

test('aggregates token usage from every OpenCode step including cache fallback', () => {
  const first = tokenUsageFromOpenCodeEvent({
    part: { tokens: { total: 20, input: 12, output: 8 } },
  });
  const second = tokenUsageFromOpenCodeEvent({
    part: { tokens: { input: 3, output: 2, cache: { read: 10, write: 1 } } },
  });
  assert.deepEqual(addTokenUsage(first, second), { total: 36, input: 15, output: 10 });
});

test('keeps only safe OpenCode event metadata for the renderer', () => {
  const publicEvent = publicOpenCodeEvent({
    type: 'tool_use',
    sessionID: 'ses_valid',
    part: {
      id: 'prt_valid',
      type: 'tool',
      tool: 'bash',
      state: { status: 'completed', input: { command: 'private' }, output: 'private' },
    },
  });
  assert.deepEqual(publicEvent, {
    type: 'tool_use',
    sessionID: 'ses_valid',
    part: {
      id: 'prt_valid',
      type: 'tool',
      tool: 'bash',
      state: { status: 'completed' },
    },
  });
});

test('discovers only known non-empty package scripts', () => {
  assert.deepEqual(
    discoverProjectChecks({
      scripts: {
        typecheck: 'tsc --noEmit',
        lint: '   ',
        test: 'node --test',
        deploy: 'dangerous-command',
        build: 42,
        check: 'npm run lint',
      },
    }),
    ['typecheck', 'test', 'check'],
  );
  assert.deepEqual(discoverProjectChecks('{broken json'), []);
  assert.deepEqual(discoverProjectChecks({ scripts: [] }), []);
});

test('normalizes selected quality gates against the discovered allowlist', () => {
  assert.deepEqual(
    normalizeProjectChecks(['test', 'typecheck', 'test'], ['typecheck', 'test', 'build']),
    ['typecheck', 'test'],
  );
  assert.equal(normalizeProjectChecks(['deploy'], ['typecheck', 'test']), null);
  assert.equal(normalizeProjectChecks(['build'], ['typecheck', 'test']), null);
  assert.equal(normalizeProjectChecks([], ['test']), null);
});

test('aggregates stdout and stderr under one byte limit', () => {
  const output = createBoundedProjectCheckOutput(12);
  output.append('stdout', '12345678');
  output.append('stderr', 'abcdef');
  output.append('stdout', 'ignored');
  assert.deepEqual(output.snapshot(), {
    stdout: '12345678',
    stderr: 'abcd',
    bytes: 12,
    truncated: true,
  });
});

test('derives explicit final states for passed, failed and cancelled checks', () => {
  assert.deepEqual(
    projectCheckFinalState({
      cancelled: false,
      results: [{ code: 0 }, { code: 0 }],
      expectedCount: 2,
    }),
    { status: 'passed', passed: true, cancelled: false },
  );
  assert.equal(
    projectCheckFinalState({
      cancelled: false,
      stopped: true,
      results: [{ code: 0 }],
      expectedCount: 1,
    }).status,
    'failed',
  );
  assert.equal(
    projectCheckFinalState({ cancelled: true, results: [], expectedCount: 2 }).status,
    'cancelled',
  );
});

test('queue insertion is bounded and duplicate-safe, and dequeue is sequential', () => {
  const first = { id: 'task-1', prompt: 'primeira' };
  const second = { id: 'task-2', prompt: 'segunda' };
  const inserted = enqueueUniqueTask([], first, 2);
  const withSecond = enqueueUniqueTask(inserted.queue, second, 2);
  assert.equal(enqueueUniqueTask(withSecond.queue, second, 2).reason, 'duplicate');
  assert.equal(enqueueUniqueTask(withSecond.queue, { id: 'task-3' }, 2).reason, 'full');

  const next = takeNextQueuedTask(withSecond.queue, { occupied: false, paused: false });
  assert.equal(next.task.id, 'task-1');
  assert.deepEqual(next.queue.map((task) => task.id), ['task-2']);
  assert.equal(takeNextQueuedTask(next.queue, { occupied: true }).task, null);
  assert.equal(takeNextQueuedTask(next.queue, { paused: true }).task, null);
});

test('only an automatic failed verification with pending work pauses the queue', () => {
  assert.equal(
    shouldPauseQueueAfterVerification({
      automatic: true,
      passed: false,
      cancelled: false,
      pendingCount: 2,
    }),
    true,
  );
  assert.equal(
    shouldPauseQueueAfterVerification({
      automatic: false,
      passed: false,
      cancelled: false,
      pendingCount: 2,
    }),
    false,
  );
  assert.equal(
    shouldPauseQueueAfterVerification({
      automatic: true,
      passed: false,
      cancelled: true,
      pendingCount: 2,
    }),
    false,
  );
  assert.equal(
    shouldPauseQueueAfterVerification({
      automatic: true,
      passed: false,
      cancelled: false,
      pendingCount: 0,
    }),
    false,
  );
});

test('migrates old saved messages and removes unsafe or duplicate queued tasks', () => {
  const messages = normalizeStoredMespMessages([
    { id: 'old-user', role: 'user', text: 'ola', status: 'done' },
    {
      id: 'old-assistant',
      role: 'assistant',
      text: 'executando',
      status: 'streaming',
      verification: {
        id: 'verify-old',
        status: 'running',
        checks: [{ name: 'test', status: 'running', output: 'partial' }],
      },
    },
  ]);
  assert.deepEqual(messages[0].tools, []);
  assert.equal(messages[1].status, 'cancelled');
  assert.equal(messages[1].verification.status, 'cancelled');
  assert.equal(messages[1].verification.checks[0].status, 'cancelled');

  const queue = normalizeStoredMespQueue([
    {
      id: 'task-1',
      prompt: 'teste',
      mode: 'assisted',
      model: '9router/cx/model',
      limits: {},
      cwd: 'C:/project',
    },
    {
      id: 'task-1',
      prompt: 'duplicada',
      mode: 'assisted',
      model: '9router/cx/model',
      limits: {},
    },
    {
      id: 'task-2',
      prompt: 'modelo invalido',
      mode: 'fast',
      model: 'other/model',
      limits: {},
    },
  ]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, 'task-1');
});
