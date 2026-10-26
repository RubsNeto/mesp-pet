import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeProviderPriority, providerRank } from '../electron/dockRouterPriority.mjs';
import {
  readProviderPriority,
  writeProviderPriority,
  providerPriorityFile,
} from '../electron/dockRouterPriorityFile.mjs';
import { autoRouterCandidates, recentFailure } from '../electron/dockRouter.mjs';

test('priority keeps order, drops duplicates and malformed provider ids', () => {
  assert.deepEqual(
    normalizeProviderPriority([
      'antigravity',
      'codex',
      'antigravity',
      '../x',
      7,
      'Codex',
      'claude',
    ]),
    ['antigravity', 'codex', 'claude'],
  );
  assert.deepEqual(normalizeProviderPriority('antigravity'), []);
  assert.equal(providerRank(['antigravity', 'codex'], 'codex'), 1);
  assert.equal(providerRank(['antigravity', 'codex'], 'github'), 2);
  assert.equal(providerRank([], 'github'), 0);
});

test('priority persists atomically in the router profile and tolerates a missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesp-priority-'));
  try {
    assert.deepEqual(readProviderPriority(dir), []);
    assert.deepEqual(writeProviderPriority(dir, ['antigravity', 'codex', 'bad id']), [
      'antigravity',
      'codex',
    ]);
    assert.deepEqual(readProviderPriority(dir), ['antigravity', 'codex']);
    assert.equal(await readFile(providerPriorityFile(dir), 'utf8'), '["antigravity","codex"]');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const account = (id, provider) => ({
  id,
  label: id,
  provider,
  providerName: provider,
  prefix: provider,
  active: true,
  health: 'active',
  quotaState: 'available',
  plan: '',
  limitReached: false,
  quotas: [],
  locks: [],
  lastFailure: null,
  rateLimited: false,
  consumption: null,
});
const model = (id, accountId) => ({
  id: `9router/${id}`,
  name: id,
  provider: '',
  providerName: '',
  accountIds: [accountId],
  source: 'live',
});

test('Auto tries the preferred provider first and falls back in the chosen order', () => {
  const accounts = [account('gh', 'github'), account('ag', 'antigravity'), account('cx', 'codex')];
  const models = [
    model('gh/gpt-4.1', 'gh'),
    model('ag/claude-sonnet-4-6', 'ag'),
    model('cx/gpt-5.4', 'cx'),
  ];
  const request = { complexity: 'light', level: 1, tools: false, inputChars: 10 };
  const ordered = autoRouterCandidates(accounts, models, Date.now(), request, [
    'antigravity',
    'codex',
  ]).map((choice) => choice.accountId);
  assert.deepEqual(ordered, ['ag', 'cx', 'gh']);
  // Without a priority the existing ranking (complexity fit, reset, quality) applies.
  assert.notDeepEqual(
    autoRouterCandidates(accounts, models, Date.now(), request).map((c) => c.accountId)[0],
    'ag',
  );
});

test('stale errors left by 9Router do not keep a recovered account blocked', () => {
  const now = Date.parse('2026-10-26T15:00:00Z');
  assert.equal(recentFailure({ errorCode: 403, lastErrorAt: '2026-10-01T12:00:00Z' }, now), false);
  assert.equal(
    recentFailure(
      { errorCode: 403, lastErrorAt: '2026-10-26T14:55:00Z', testStatus: 'active' },
      now,
    ),
    false,
  );
  assert.equal(
    recentFailure(
      { errorCode: 403, lastErrorAt: '2026-10-26T14:55:00Z', testStatus: 'unavailable' },
      now,
    ),
    true,
  );
});

test('a ranked provider whose model listing fails still enters Auto through its catalogue', async () => {
  const { createRouterOverviewService } = await import('../electron/dockRouter.mjs');
  const make = (order) =>
    createRouterOverviewService({
      origin: 'http://localhost',
      autoSupported: true,
      priority: () => order,
      fetchJson: async (route) => {
        if (route === '/api/providers')
          return {
            connections: [
              { id: 'ag', provider: 'antigravity', testStatus: 'active' },
              { id: 'gh', provider: 'github', testStatus: 'active' },
            ],
          };
        if (route === '/api/providers/ag/models') return { error: 'listing failed', status: 500 };
        if (route === '/api/providers/gh/models') return { models: [{ id: 'gpt-4.1' }] };
        if (route === '/v1/models') return { data: [{ id: 'ag/claude-sonnet-4-6' }] };
        return {};
      },
    });
  const ranked = await make(['antigravity', 'github']).routing(true);
  assert.equal(ranked.auto.next.accountId, 'ag');
  const unranked = await make([]).routing(true);
  assert.equal(unranked.auto.next.accountId, 'gh');
});

test('with a provider order, real work prefers Opus then Sonnet while light requests stay fast', () => {
  const accounts = [account('ag', 'antigravity'), account('gh', 'github')];
  const models = [
    model('ag/gemini-3.8-flash-medium', 'ag'),
    model('ag/claude-sonnet-4-6', 'ag'),
    model('ag/claude-opus-4-6-thinking', 'ag'),
    model('gh/gpt-4.1', 'gh'),
  ];
  const coding = { complexity: 'standard', level: 2, tools: true, inputChars: 500 };
  const light = { complexity: 'light', level: 1, tools: false, inputChars: 20 };
  const order = ['antigravity', 'github'];
  assert.deepEqual(
    autoRouterCandidates(accounts, models, Date.now(), coding, order)
      .slice(0, 3)
      .map((c) => c.model),
    [
      '9router/ag/claude-opus-4-6-thinking',
      '9router/ag/claude-sonnet-4-6',
      '9router/ag/gemini-3.8-flash-medium',
    ],
  );
  assert.equal(
    autoRouterCandidates(accounts, models, Date.now(), light, order)[0].model,
    '9router/ag/gemini-3.8-flash-medium',
  );
});
