import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  VERIFIED_FAIL_MS,
  VERIFIED_OK_MS,
  definitiveFailure,
  isChatModel,
  normalizeVerification,
  verificationKey,
  verificationState,
} from '../electron/dockModelVerification.mjs';
import {
  readModelVerification,
  writeModelVerification,
} from '../electron/dockRouterPriorityFile.mjs';
import { createRouterOverviewService } from '../electron/dockRouter.mjs';

const now = Date.parse('2026-10-26T15:00:00Z');

test('verification state expires successes after a week and refusals after three days', () => {
  const store = {
    [verificationKey('a', '9router/ag/claude-opus-4-6-thinking')]: { ok: true, at: now - 1000 },
    [verificationKey('a', '9router/ag/claude-opus-5-5')]: {
      ok: false,
      at: now - 1000,
      status: 404,
    },
  };
  assert.equal(verificationState(store, 'a', '9router/ag/claude-opus-4-6-thinking', now), 'ok');
  assert.equal(verificationState(store, 'a', '9router/ag/claude-opus-5-5', now), 'failed');
  assert.equal(verificationState(store, 'b', '9router/ag/claude-opus-5-5', now), 'untested');
  assert.equal(
    verificationState(store, 'a', '9router/ag/claude-opus-4-6-thinking', now + VERIFIED_OK_MS),
    'untested',
  );
  assert.equal(
    verificationState(store, 'a', '9router/ag/claude-opus-5-5', now + VERIFIED_FAIL_MS),
    'untested',
  );
});

test('refusals that prove a model cannot run are told apart from transient errors', () => {
  assert.equal(definitiveFailure(404), true);
  assert.equal(definitiveFailure(503, '[antigravity/claude-opus-5-5] [404]: NOT_FOUND'), true);
  assert.equal(definitiveFailure(503, 'all accounts locked (reset after 2m)'), false);
  assert.equal(definitiveFailure(429, 'Resource has been exhausted'), false);
  assert.equal(isChatModel('ag/gemini-3.1-flash-image'), false);
  assert.equal(isChatModel('ag/claude-sonnet-4-6'), true);
});

test('stored results are validated and survive a restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesp-verify-'));
  try {
    assert.deepEqual(readModelVerification(dir), {});
    const recent = Date.now();
    writeModelVerification(dir, {
      [verificationKey('acc', '9router/ag/claude-sonnet-4-6')]: { ok: true, at: recent },
      'bad key': { ok: true, at: recent },
      [verificationKey('acc', '9router/x')]: { ok: 'yes', at: recent },
    });
    assert.deepEqual(Object.keys(readModelVerification(dir)), [
      verificationKey('acc', '9router/ag/claude-sonnet-4-6'),
    ]);
    assert.deepEqual(normalizeVerification(null), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('once verification has run, only models that answered on a usable account are offered', async () => {
  const store = {
    [verificationKey('ag', '9router/ag/claude-opus-4-6-thinking')]: { ok: true, at: Date.now() },
    [verificationKey('ag', '9router/ag/claude-opus-5-5')]: {
      ok: false,
      at: Date.now(),
      status: 404,
    },
  };
  const service = createRouterOverviewService({
    origin: 'http://localhost',
    autoSupported: true,
    verification: () => store,
    fetchJson: async (route) => {
      if (route === '/api/providers')
        return { connections: [{ id: 'ag', provider: 'antigravity', testStatus: 'active' }] };
      if (route === '/api/providers/ag/models') return { error: 'listing failed', status: 500 };
      if (route === '/v1/models')
        return {
          data: [
            { id: 'ag/claude-opus-4-6-thinking' },
            { id: 'ag/claude-opus-5-5' },
            { id: 'ag/gemini-3.8-flash-medium' },
            { id: 'ag/gemini-3.1-flash-image' },
          ],
        };
      return {};
    },
  });
  const overview = await service.models(true);
  assert.deepEqual(
    overview.models.map((model) => [model.id, model.available, model.reason]),
    [
      ['9router/ag/claude-opus-4-6-thinking', true, undefined],
      ['9router/ag/claude-opus-5-5', false, 'model'],
      ['9router/ag/gemini-3.8-flash-medium', false, 'pending'],
    ],
  );
  assert.equal(overview.auto.next.model, '9router/ag/claude-opus-4-6-thinking');
  assert.deepEqual(overview.models[2].ownerIds, ['ag']);
});
