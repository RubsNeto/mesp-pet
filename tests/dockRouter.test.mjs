import test from 'node:test';
import assert from 'node:assert/strict';
import { routerPage, routerConnectionSummary } from '../electron/dockRouter.mjs';
import { normalizeDockProjects } from '../src/services/dockCore.mjs';

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
