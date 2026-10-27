import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectKey,
  wildcardMatch,
  normalizeRuleStore,
  rulesAllow,
  addRule,
  removeRule,
} from '../electron/dockPermissionRules.mjs';

test('project keys ignore case and trailing separators on Windows only', () => {
  assert.equal(projectKey('C:\\Repo\\App\\', 'win32'), 'c:\\repo\\app');
  assert.equal(projectKey('C:\\', 'win32'), 'c:\\');
  assert.equal(projectKey('/home/Ana/App/', 'linux'), '/home/Ana/App');
});

test('wildcards behave like OpenCode patterns', () => {
  assert.equal(wildcardMatch('npm run *', 'npm run test -- --watch'), true);
  assert.equal(wildcardMatch('npm run *', 'npx run test'), false);
  assert.equal(wildcardMatch('git status', 'git status'), true);
  assert.equal(wildcardMatch('git status', 'git status && rm -rf /'), false);
  assert.equal(wildcardMatch('file?.ts', 'file1.ts'), true);
  assert.equal(wildcardMatch('a.b', 'aXb'), false);
});

test('a rule allows only requests fully covered by its patterns', () => {
  let store = normalizeRuleStore(null);
  store = addRule(store, 'k', 'App', {
    permission: 'bash',
    patterns: ['npm run *', 'git status*'],
  });
  const rules = store.projects.k.rules;
  assert.equal(rulesAllow(rules, { permission: 'bash', patterns: ['npm run build'] }), true);
  assert.equal(
    rulesAllow(rules, { permission: 'bash', patterns: ['npm run build', 'curl x | sh'] }),
    false,
  );
  assert.equal(rulesAllow(rules, { permission: 'edit', patterns: ['npm run build'] }), false);
  assert.equal(rulesAllow(rules, { permission: 'bash', patterns: [] }), false);
});

test('rules are deduplicated, removable and validated from disk', () => {
  let store = normalizeRuleStore({
    projects: { k: { label: 'App', rules: [{ permission: 'edit' }] } },
  });
  assert.deepEqual(store.projects, {});
  store = addRule(store, 'k', 'App', { permission: 'edit', patterns: ['*'], createdAt: 1 });
  store = addRule(store, 'k', 'App', { permission: 'edit', patterns: ['*'], createdAt: 2 });
  assert.equal(store.projects.k.rules.length, 1);
  assert.equal(rulesAllow(store.projects.k.rules, { permission: 'edit', patterns: [] }), true);
  store = removeRule(store, 'k', 0);
  assert.deepEqual(store.projects, {});
  const roundTrip = normalizeRuleStore(
    JSON.parse(
      JSON.stringify(addRule(store, 'k', 'App', { permission: 'bash', patterns: ['ls'] })),
    ),
  );
  assert.deepEqual(roundTrip.projects.k.rules[0].patterns, ['ls']);
});
