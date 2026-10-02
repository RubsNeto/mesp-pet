import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routerPage,
  routerConnectionSummary,
  normalizeRouterQuotas,
  normalizeRouterStats,
  autoRouterCandidates,
  createRouterOverviewService,
  patchRouterAccountSelection,
  routerRunModel,
  classifyRouterRequest,
  createRouterHealth,
  patchRouterCopilotResponses,
  routerModelLevel,
} from '../electron/dockRouter.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';

test('Auto attribution separates simultaneous sessions and rejects previous, cancelled and manual runs', () => {
  const route = { session: 'ses_a', startedAt: 200, model: 'cx/model-a' };
  const run = { sessionId: 'ses_a', startedAt: 100, autoModel: true, cancelled: false };
  assert.equal(routerRunModel(route, run), 'cx/model-a');
  for (const changed of [
    { sessionId: 'ses_b' },
    { startedAt: 300 },
    { cancelled: true },
    { autoModel: false },
    { sessionId: null },
  ])
    assert.equal(routerRunModel(route, { ...run, ...changed }), null);
  for (const model of ['mesp-auto', '9router/mesp-auto', '<script>', '', 'x'.repeat(241)])
    assert.equal(routerRunModel({ ...route, model }, run), null);
  assert.equal(routerRunModel(undefined, run), null);
});
import { readFileSync } from 'node:fs';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { routerLocalAuthHeaders } from '../electron/dockRouterLocalAuth.mjs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseRouterDataDirectory } from '../electron/dockRouterProfile.mjs';
import { normalizeDockProjects } from '../src/services/dockCore.mjs';
import {
  routerPanelBounds,
  routerPanelPage,
  routerPanelSection,
  ROUTER_PANEL_SECTIONS,
} from '../electron/dockRouterPanel.mjs';

test('embedded view rejects malformed and empty rectangles', () => {
  for (const bounds of [
    null,
    {},
    { x: 0, y: 0, width: NaN, height: 20 },
    { x: 0, y: 0, width: 100, height: -1 },
    { x: 1200, y: 0, width: 100, height: 100 },
  ]) {
    assert.equal(routerPanelBounds(bounds, { width: 1000, height: 800 }), null);
  }
});
test('embedded view rounds inward and clips to its parent', () => {
  assert.deepEqual(
    routerPanelBounds(
      { x: 12.2, y: 66.7, width: 300.8, height: 402.8 },
      { width: 1000, height: 800 },
    ),
    { x: 13, y: 67, width: 300, height: 402 },
  );
  assert.deepEqual(
    routerPanelBounds({ x: -10, y: 700, width: 1050, height: 300 }, { width: 1000, height: 800 }),
    { x: 0, y: 700, width: 1000, height: 100 },
  );
});
test('embedded navigation only accepts known local sections', () => {
  assert.equal(routerPanelSection('https://evil.example').path, '/dashboard/providers');
  assert.equal(routerPanelSection('../../api/shutdown').id, 'providers');
  assert.equal(
    new Set(ROUTER_PANEL_SECTIONS.map((item) => item.id)).size,
    ROUTER_PANEL_SECTIONS.length,
  );
  assert.ok(ROUTER_PANEL_SECTIONS.every((item) => item.path.startsWith('/dashboard')));
});
test('embedded navigation recognizes nested tools and provider pages', () => {
  assert.equal(routerPanelPage('/dashboard/cli-tools/claude'), 'cli-tools');
  assert.equal(routerPanelPage('/dashboard/providers/codex'), 'codex');
  assert.equal(routerPanelPage('/dashboard/providers/github'), 'providers');
  assert.equal(routerPanelPage('/dashboard/settings/pricing'), 'pricing');
});

test('local native sessions expire after five minutes and never modify the stored auth key', () => {
  const qa = fileURLToPath(new URL('../qa/', import.meta.url));
  mkdirSync(qa, { recursive: true });
  const directory = mkdtempSync(join(qa, 'router-auth-'));
  assert.deepEqual(routerLocalAuthHeaders(directory), {});
  assert.deepEqual(routerLocalAuthHeaders(), {});
  const secret = 'local-test-secret-that-is-only-for-qa';
  writeFileSync(join(directory, 'jwt-secret'), secret);
  const { cookie } = routerLocalAuthHeaders(directory, 1700000000000);
  const [header, payload, signature] = cookie.replace('auth_token=', '').split('.');
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
    authenticated: true,
    iat: 1700000000,
    exp: 1700000300,
  });
  assert.equal(
    signature,
    createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url'),
  );
  assert.equal(readFileSync(join(directory, 'jwt-secret'), 'utf8'), secret);
});

test('expired accounts do not advertise fallback models or enter Auto routing', async () => {
  const service = createRouterOverviewService({
    origin: 'http://localhost',
    autoSupported: true,
    fetchJson: async (route) => {
      if (route === '/api/providers')
        return { connections: [{ id: 'expired', provider: 'codex', isActive: true }] };
      if (route === '/v1/models') return { data: [{ id: 'cx/gpt-codex' }] };
      if (route.endsWith('/models'))
        return {
          models: [{ id: 'gpt-codex' }],
          warning: 'Failed to fetch Codex models: 401 expired',
        };
      return { message: 'Re-authorize account' };
    },
  });
  const overview = await service.overview();
  assert.equal(overview.accounts[0].health, 'auth');
  assert.equal(overview.accounts[0].quotaState, 'error');
  assert.deepEqual(overview.models, []);
  assert.equal(overview.auto.available, false);
});

test('model discovery does not wait for consumption and coalesces concurrent refreshes', async () => {
  const calls = [];
  const service = createRouterOverviewService({
    origin: 'http://localhost',
    autoSupported: true,
    fetchJson: async (route) => {
      calls.push(route);
      if (route === '/api/providers')
        return { connections: [{ id: 'ready', provider: 'codex', testStatus: 'success' }] };
      if (route === '/api/providers/ready/models') return { models: [{ id: 'gpt-codex' }] };
      throw new Error('Consumption and catalog must not be queried by the model menu');
    },
  });
  const [first, second] = await Promise.all([service.models(true), service.models(true)]);
  assert.strictEqual(first, second);
  assert.deepEqual(
    first.models.map((m) => m.id),
    ['9router/cx/gpt-codex'],
  );
  assert.equal(first.totals, null);
  assert.equal(first.auto.available, true);
  assert.deepEqual(calls, ['/api/providers', '/api/providers/ready/models']);
});

test('model menu omits unconfirmed, exhausted, locked and forbidden account models', async () => {
  const connections = [
    { id: 'ready', provider: 'codex', testStatus: 'success' },
    { id: 'empty', provider: 'claude', testStatus: 'success' },
    {
      id: 'locked',
      provider: 'gemini-cli',
      testStatus: 'success',
      modelLock_all: new Date(Date.now() + 60000).toISOString(),
    },
    { id: 'forbidden', provider: 'github', testStatus: 'success', errorCode: 403 },
    { id: 'unconfirmed', provider: 'openai', testStatus: 'success' },
  ];
  const service = createRouterOverviewService({
    origin: 'http://localhost',
    autoSupported: true,
    fetchJson: async (route) => {
      if (route === '/api/providers') return { connections };
      if (route.endsWith('/unconfirmed/models'))
        return { models: [{ id: 'static-model' }], warning: 'Discovery failed' };
      if (route.endsWith('/models')) return { models: [{ id: 'model' }] };
      if (route === '/api/usage/empty')
        return { quotas: { session: { used: 100, total: 100, remaining: 0 } } };
      return {};
    },
  });
  const overview = await service.overview();
  assert.deepEqual(
    overview.models.map((m) => m.id),
    ['9router/cx/model'],
  );
  const quick = await service.models();
  assert.deepEqual(
    quick.models.map((m) => m.id),
    ['9router/cx/model'],
  );
});

test('router windows open only known local configuration routes', () => {
  assert.equal(routerPage('codex'), '/dashboard/providers/codex');
  assert.equal(routerPage('claude'), '/dashboard/providers/claude');
  assert.equal(routerPage('cli-tools'), '/dashboard/cli-tools');
  for (const unsafe of [
    'https://evil.test',
    '../../secrets',
    '__proto__',
    null,
    {},
    'providers?run=1',
  ])
    assert.equal(routerPage(unsafe), '/dashboard');
});
test('connection summaries count enabled accounts and never expose credentials or account data', () => {
  const result = routerConnectionSummary({
    connections: [
      {
        provider: 'codex',
        isActive: true,
        accessToken: 'SECRET',
        refreshToken: 'SECRET',
        apiKey: 'SECRET',
        email: 'private@test',
        providerSpecificData: { key: 'SECRET' },
      },
      { provider: 'codex', isActive: false },
      { provider: 'claude', testStatus: 'unauthorized' },
      { provider: 'claude', testStatus: 'success' },
      { provider: '<script>' },
      null,
    ],
  });
  assert.deepEqual(result, [
    { provider: 'codex', accounts: 2, active: 1 },
    { provider: 'claude', accounts: 2, active: 1 },
  ]);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.equal(routerConnectionSummary({ error: 'unauthorized' }), null);
  assert.deepEqual(routerConnectionSummary({ connections: [] }), []);
});
test('selected models survive restart per MESP without accepting unrelated configuration', () => {
  const projects = normalizeDockProjects([
    {
      id: 'mesp-one',
      workDir: 'C:/project',
      agent: 'mesp-code',
      routerModel: '9router/cx/gpt-model',
    },
    { id: 'mesp-two', workDir: null, agent: 'codex', routerModel: 'not-a-router-model' },
  ]);
  assert.equal(projects[0].routerModel, '9router/cx/gpt-model');
  assert.equal(projects[1].routerModel, undefined);
});

const now = Date.now();
test('existing router logins are reused read-only; isolated tests and populated MESP profiles never switch stores', () => {
  const qa = fileURLToPath(new URL('../qa/', import.meta.url));
  mkdirSync(qa, { recursive: true });
  const directory = mkdtempSync(join(qa, 'profile-selection-')),
    own = join(directory, 'mesp'),
    standard = join(directory, '9router');
  for (const target of [own, standard]) {
    mkdirSync(join(target, 'db'), { recursive: true });
    const db = new DatabaseSync(join(target, 'db/data.sqlite'));
    db.exec('CREATE TABLE providerConnections(id TEXT PRIMARY KEY)');
    if (target === standard) db.exec("INSERT INTO providerConnections VALUES('existing')");
    db.close();
  }
  const before = readFileSync(join(standard, 'db/data.sqlite'));
  assert.equal(
    chooseRouterDataDirectory({ ownDirectory: own, appData: directory }).directory,
    standard,
  );
  assert.equal(
    chooseRouterDataDirectory({ ownDirectory: own, appData: directory, isolated: true }).directory,
    own,
  );
  const db = new DatabaseSync(join(own, 'db/data.sqlite'));
  db.exec("INSERT INTO providerConnections VALUES('mesp')");
  db.close();
  assert.equal(chooseRouterDataDirectory({ ownDirectory: own, appData: directory }).directory, own);
  assert.deepEqual(readFileSync(join(standard, 'db/data.sqlite')), before);
});
const account = (id, reset, used = 40, extra = {}) => ({
  id,
  label: id,
  provider: 'codex',
  prefix: 'cx',
  active: true,
  health: 'active',
  locks: [],
  limitReached: false,
  quotas: normalizeRouterQuotas({
    quotas: {
      session: {
        used,
        total: 100,
        remaining: 100 - used,
        resetAt: new Date(now + reset).toISOString(),
      },
    },
  }),
  ...extra,
});
const model = (id, ids) => ({ id: `9router/cx/${id}`, accountIds: ids });

test('Auto classifies only user intent locally and retains complex intent for short follow-ups', () => {
  const classify = (text, extra = {}) =>
    classifyRouterRequest({ messages: [{ role: 'user', content: text }], ...extra });
  assert.equal(classify('Qual é a capital do Brasil?').complexity, 'light');
  assert.equal(classify('Corrija a função do formulário React').complexity, 'standard');
  assert.equal(
    classify('Investigue a causa raiz do erro de concorrência e refatore a arquitetura do sistema')
      .complexity,
    'advanced',
  );
  assert.equal(
    classify('Qual é a capital?', {
      messages: [
        { role: 'system', content: 'security architecture '.repeat(6000) },
        { role: 'user', content: 'Qual é a capital?' },
      ],
    }).complexity,
    'light',
  );
  assert.equal(classify('Resumo', { tools: [{ type: 'function' }] }).tools, true);
  assert.equal(
    classify('Resumo', { tools: [{ type: 'function' }], tool_choice: 'none' }).tools,
    false,
  );
  assert.equal(
    classifyRouterRequest({
      input: 'Explique a arquitetura e performance de um sistema distribuído',
    }).complexity,
    'advanced',
  );
  assert.equal(
    classifyRouterRequest({
      messages: [
        { role: 'user', content: 'Investigue e refatore a arquitetura do sistema' },
        { role: 'assistant', content: 'Plano' },
        { role: 'user', content: 'continue' },
      ],
    }).complexity,
    'advanced',
  );
  assert.equal(
    classifyRouterRequest(
      { messages: [{ role: 'user', content: 'Título para investigar e refatorar a arquitetura' }] },
      'title',
    ).complexity,
    'light',
  );
});

test('Auto matches model complexity before resets and manages available credits without inventing balances', () => {
  assert.equal(routerModelLevel(model('gpt-6-luna', [])), 1);
  const accounts = [
    account('near-mini', 1000),
    account('far-advanced', 600000),
    account('standard', 10000),
  ];
  const models = [
    model('gpt-5-mini', ['near-mini']),
    model('gpt-5-codex', ['far-advanced']),
    model('claude-sonnet', ['standard']),
  ];
  const classify = (content) => classifyRouterRequest({ messages: [{ role: 'user', content }] });
  assert.equal(
    autoRouterCandidates(accounts, models, now, classify('O que é DNS?'))[0].accountId,
    'near-mini',
  );
  assert.equal(
    autoRouterCandidates(accounts, models, now, classify('Corrija o formulário React'))[0]
      .accountId,
    'standard',
  );
  assert.equal(
    autoRouterCandidates(
      accounts,
      models,
      now,
      classify('Audite a segurança e refatore a arquitetura do sistema'),
    )[0].accountId,
    'far-advanced',
  );
  const funded = [
    account('almost-empty', 1000, 99),
    account('enough', 60000, 30),
    account('unknown', 500, 0, { quotas: [] }),
  ];
  const pool = [
    model(
      'gpt-5-codex',
      funded.map((a) => a.id),
    ),
  ];
  const choices = autoRouterCandidates(
    funded,
    pool,
    now,
    classify('Audite a segurança e refatore a arquitetura do sistema'),
  );
  assert.equal(choices[0].accountId, 'enough');
  assert.equal(choices.find((choice) => choice.accountId === 'unknown').capacity, null);
  funded[2].quotas = normalizeRouterQuotas({
    quotas: {
      chat: { unlimited: true },
      credits: { remaining: 1 },
    },
  });
  const uncertain = autoRouterCandidates(
    funded,
    pool,
    now,
    classify('Audite a segurança e refatore a arquitetura do sistema'),
  ).find((choice) => choice.accountId === 'unknown');
  assert.equal(uncertain.capacity, null);
  assert.equal(
    uncertain.funding,
    1,
    'Unlimited chat cannot turn an unknown credit balance into unlimited funding',
  );
  funded[0] = account('almost-empty', 1000, 70);
  assert.equal(
    autoRouterCandidates(
      funded,
      pool,
      now,
      classify('Audite a segurança e refatore a arquitetura do sistema'),
    )[0].accountId,
    'almost-empty',
  );
});

test('Auto respects tool support, published context limits, remaining balances and model-scoped cooldowns', () => {
  const request = classifyRouterRequest({
    messages: [{ role: 'user', content: 'Corrija o código' }],
    tools: [{ type: 'function' }],
  });
  const ready = account('ready', 1000);
  const choices = autoRouterCandidates(
    [ready],
    [
      { ...model('gpt-5', ['ready']), supportsTools: false },
      { ...model('small-context', ['ready']), contextLength: 2 },
      model('claude-sonnet', ['ready']),
    ],
    now,
    request,
  );
  assert.equal(choices.length, 1);
  assert.equal(
    normalizeRouterQuotas({ quotas: { credits: { total: 200, remaining: 20 } } })[0].usedPercent,
    90,
  );
  const health = createRouterHealth(),
    choice = choices[0];
  health.failed(choice, 'model', null, now);
  assert.equal(health.available(choice, now), false);
  assert.equal(health.available({ ...choice, model: 'other' }, now), true);
  assert.equal(health.available(choice, now + 600001), true);
  health.failed(choice, 429, '2', now);
  assert.equal(health.available({ ...choice, model: 'other' }, now), false);
  assert.equal(health.available(choice, now + 2001), true);
  health.failed(choice, 429, null, now);
  assert.equal(health.available(choice, now + 1001), true, 'A passed reset releases the cooldown');
});

test('routing discovery shares cached model and quota queries and never reads usage history', async () => {
  const calls = [];
  const service = createRouterOverviewService({
    origin: 'http://local',
    autoSupported: true,
    fetchJson: async (route) => {
      calls.push(route);
      if (route === '/api/providers')
        return { connections: [{ id: 'ready', provider: 'codex', testStatus: 'success' }] };
      if (route.endsWith('/models')) return { models: [{ id: 'gpt-codex' }] };
      if (route === '/api/usage/ready')
        return { quotas: { session: { total: 100, remaining: 50 } } };
      throw Error('History must not be queried for routing');
    },
  });
  const result = await service.routing();
  assert.equal(result.modelsAvailable, true);
  assert.equal(result.accounts[0].quotas[0].usedPercent, 50);
  await service.routing();
  assert.equal(calls.length, 3);
  assert.ok(!calls.some((route) => route.includes('stats')));
});

test('Copilot Responses compatibility uses the native stream translator and fails closed on another version', () => {
  const before = 'n=this.buildHeaders(d,c),p=(0,h.h)(a,b,c,d);';
  assert.equal(
    patchRouterCopilotResponses(before),
    'n=this.buildHeaders(d,!0),p=(0,h.h)(a,b,!0,d);',
  );
  assert.throws(() => patchRouterCopilotResponses('another build'), /incompatível/);
  assert.throws(() => patchRouterCopilotResponses(before + before), /incompatível/);
});

test('recent routing failures survive restart, expire, and persist no credentials or request text', () => {
  const choice = { accountId: 'ready', model: '9router/cx/gpt-5', resetAt: Date.now() + 60000 };
  const health = createRouterHealth();
  health.failed(choice, 'model');
  const saved = JSON.parse(JSON.stringify(health.snapshot()));
  const restored = createRouterHealth(saved);
  assert.equal(restored.available(choice), false);
  assert.equal(restored.available({ ...choice, model: '9router/cx/gpt-4.1' }), true);
  assert.equal(restored.available(choice, Date.now() + 600001), true);
  assert.deepEqual(
    createRouterHealth([
      ['INVALID SECRET!', Date.now() + 10000],
      ['ready:*', 'secret'],
    ]).snapshot(),
    [],
  );
  assert.equal(createRouterHealth({ token: 'SECRET' }).available(choice), true);
});

test('model-specific credits do not exhaust unrelated versions or explicitly zero-cost models', () => {
  const ready = account('ready', 1000);
  ready.quotas = normalizeRouterQuotas({
    quotas: {
      'gemini-3.1-pro': { total: 100, remaining: 0 },
      premium_interactions: { total: 100, remaining: 0 },
      chat: { unlimited: true },
    },
  });
  assert.equal(
    autoRouterCandidates([ready], [{ ...model('gpt-4.1', ['ready']), rateMultiplier: 0 }], now)
      .length,
    1,
  );
  ready.quotas = ready.quotas.filter((quota) => quota.key !== 'premium_interactions');
  const choices = autoRouterCandidates(
    [ready],
    [model('gemini-3.1-pro', ['ready']), model('gemini-2.5-pro', ['ready'])],
    now,
  );
  assert.deepEqual(
    choices.map((choice) => choice.model),
    ['9router/cx/gemini-2.5-pro'],
  );
});

test('Auto prioritizes imminent reset, skipping exhausted, disabled, locked and review candidates', () => {
  const accounts = [
    account('far', 600000),
    account('near', 60000),
    account('empty', 1000, 100),
    account('disabled', 1000, 0, { active: false }),
    account('locked', 1000, 0, { locks: [{ model: 'gpt-codex', until: now + 10000 }] }),
  ];
  const models = [
    model(
      'gpt-codex',
      accounts.map((a) => a.id),
    ),
    model('gpt-review', ['near']),
  ];
  assert.deepEqual(
    autoRouterCandidates(accounts, models, now).map((c) => c.accountId),
    ['near', 'far'],
  );
});

test('weekly exhaustion blocks the account even when its session resets soon', () => {
  const blocked = account('blocked', 1000);
  blocked.quotas.push(
    ...normalizeRouterQuotas({
      quotas: {
        weekly: {
          used: 100,
          total: 100,
          remaining: 0,
          resetAt: new Date(now + 600000).toISOString(),
        },
      },
    }),
  );
  assert.equal(
    autoRouterCandidates(
      [blocked, account('ready', 60000)],
      [model('gpt-codex', ['blocked', 'ready'])],
      now,
    )[0].accountId,
    'ready',
  );
});

test('reset ordering precedes model discovery confidence and equal resets prefer live coding models', () => {
  const accounts = [
    account('catalog', 60000),
    account('live', 60000, 40, { provider: 'github', prefix: 'gh' }),
  ];
  const models = [
    { ...model('gpt-codex', ['catalog']), source: 'catalog' },
    { id: '9router/gh/gpt-4.1', accountIds: ['live'], source: 'live' },
    { id: '9router/gh/gpt-5.3-codex', accountIds: ['live'], source: 'live' },
  ];
  assert.equal(autoRouterCandidates(accounts, models, now)[0].model, '9router/gh/gpt-4.1');
  accounts[0] = account('catalog', 1000);
  assert.equal(autoRouterCandidates(accounts, models, now)[0].accountId, 'catalog');
});

test('model-specific quotas do not block other families and review quota cannot fund ordinary coding', () => {
  const claude = account('claude', 1000, 50, { provider: 'claude', prefix: 'cc' });
  claude.quotas.push(
    ...normalizeRouterQuotas({
      quotas: {
        'weekly opus (7d)': { used: 100, total: 100, remaining: 0 },
        review_session: { used: 0, total: 100, resetAt: new Date(now + 100).toISOString() },
      },
    }),
  );
  const choices = autoRouterCandidates(
    [claude],
    [
      { id: '9router/cc/claude-opus', accountIds: ['claude'] },
      { id: '9router/cc/claude-sonnet', accountIds: ['claude'] },
    ],
    now,
  );
  assert.equal(choices.length, 1);
  assert.equal(choices[0].model, '9router/cc/claude-sonnet');
  assert.equal(choices[0].resetAt, now + 1000);
});

test('unknown resets are fallback and malformed quota data never becomes a fabricated percentage', () => {
  const unknown = account('unknown', 60000);
  unknown.quotas = [];
  const choices = autoRouterCandidates(
    [unknown, account('known', 600000)],
    [model('gpt-codex', ['unknown', 'known'])],
    now,
  );
  assert.equal(choices[0].accountId, 'known');
  assert.equal(choices[1].resetAt, null);
  assert.deepEqual(
    normalizeRouterQuotas({ quotas: { bad: { used: 'SECRET', resetAt: 'invalid' } } }),
    [],
  );
  assert.equal(
    normalizeRouterQuotas({ quotas: { ok: { remainingPercentage: 30, resetAt: 1760000000 } } })[0]
      .usedPercent,
    70,
  );
});

test('consumption aggregates account models by ID, without double counting cache or exposing metadata', () => {
  const value = normalizeRouterStats({
    totalRequests: 3,
    totalPromptTokens: 150,
    totalCompletionTokens: 20,
    totalCachedTokens: 50,
    totalCost: 0.4,
    byAccount: {
      a: {
        connectionId: 'same',
        requests: 1,
        promptTokens: 100,
        completionTokens: 10,
        cachedTokens: 50,
        cost: 0.2,
        apiKey: 'SECRET',
      },
      b: { connectionId: 'same', requests: 2, promptTokens: 50, completionTokens: 10, cost: 0.2 },
    },
  });
  assert.equal(value.totals.tokens, 170);
  assert.equal(value.byAccount.same.requests, 3);
  assert.equal(value.byAccount.same.tokens, 170);
  assert.equal(value.byAccount.same.cost, 0.4);
  assert.ok(!JSON.stringify(value).includes('SECRET'));
  assert.equal(normalizeRouterStats({ error: 'failed' }), null);
});

test('overview unions live account models, excludes inactive catalogues, caches quotas, and whitelists IPC data', async () => {
  const calls = [];
  const service = createRouterOverviewService({
    origin: 'http://localhost',
    autoSupported: true,
    fetchJson: async (route) => {
      calls.push(route);
      if (route === '/api/providers')
        return {
          connections: [
            {
              id: 'near',
              provider: 'codex',
              name: 'Minha conta',
              accessToken: 'SECRET',
              providerSpecificData: { accountId: 'PRIVATE' },
            },
            { id: 'disabled', provider: 'claude', isActive: false },
          ],
        };
      if (route === '/v1/models')
        return { data: [{ id: 'cx/old-model' }, { id: 'cc/disabled-model' }] };
      if (route === '/api/providers/near/models')
        return { models: [{ id: 'gpt-codex' }, { id: 'gpt-new' }], refreshToken: 'SECRET' };
      if (route === '/api/usage/near')
        return {
          quotas: {
            session: {
              used: 60,
              total: 100,
              remaining: 40,
              resetAt: new Date(now + 60000).toISOString(),
            },
          },
          rawToken: 'SECRET',
        };
      if (route.startsWith('/api/usage/stats'))
        return {
          totalRequests: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalCost: 0,
          byApiKey: { SECRET: {} },
        };
      throw Error('unexpected');
    },
  });
  const data = await service.overview('today');
  assert.deepEqual(
    data.models.map((m) => m.id),
    ['9router/cx/gpt-codex', '9router/cx/gpt-new'],
  );
  assert.equal(data.auto.next.accountId, 'near');
  assert.ok(!JSON.stringify(data).includes('SECRET'));
  assert.ok(!JSON.stringify(data).includes('PRIVATE'));
  await service.overview('7d');
  assert.equal(calls.filter((r) => r === '/api/usage/near').length, 1);
  await service.overview('today', true);
  assert.equal(calls.filter((r) => r === '/api/usage/near').length, 2);
});

test('empty profiles do not advertise 9Router static models as logged-in availability', async () => {
  const service = createRouterOverviewService({
    origin: 'http://localhost',
    autoSupported: true,
    fetchJson: async (route) =>
      route === '/api/providers'
        ? { connections: [] }
        : route === '/v1/models'
          ? { data: [{ id: 'cx/gpt-codex' }] }
          : {},
  });
  const data = await service.overview();
  assert.deepEqual(data.models, []);
  assert.equal(data.auto.available, false);
  assert.equal(data.totals, null);
});

test('installed auth patch honors concurrent request scopes, fallback exclusions, and explicit native preferences', async () => {
  const source = readFileSync(
    new URL('../node_modules/9router/app/.next-cli-build/server/chunks/4664.js', import.meta.url),
    'utf8',
  );
  assert.ok(patchRouterAccountSelection(source).includes('chooseAccount'));
  assert.throws(() => patchRouterAccountSelection('incompatible version'), /incompatível/);
  const context = new AsyncLocalStorage();
  globalThis.__mespRouterContext = context;
  const fn = new Function(
    patchRouterAccountSelection(
      'return async function select(provider,excluded,model,options={}) { await Promise.resolve(); return options?.preferredConnectionId||null; }',
    ),
  )();
  const results = await Promise.all(
    ['a', 'b'].map((id) =>
      context.run(
        { chooseAccount: (_p, ex) => (ex?.has(id) ? `${id}-fallback` : id) },
        async () => [
          await fn('codex', new Set()),
          await fn('codex', new Set([id])),
          await fn('codex', null, null, { preferredConnectionId: 'native' }),
        ],
      ),
    ),
  );
  assert.deepEqual(results, [
    ['a', 'a-fallback', 'native'],
    ['b', 'b-fallback', 'native'],
  ]);
  delete globalThis.__mespRouterContext;
});
