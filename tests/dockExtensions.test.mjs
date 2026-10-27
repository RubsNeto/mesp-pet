import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCommandLine,
  mcpEntryFromForm,
  listMcpServers,
  withMcpServer,
  withoutMcpServer,
  withMcpEnabled,
  parseSkillFile,
} from '../electron/dockExtensions.mjs';

test('command lines keep quoted arguments together', () => {
  assert.deepEqual(parseCommandLine('npx -y @scope/server "C:\\Meus Docs"'), [
    'npx',
    '-y',
    '@scope/server',
    'C:\\Meus Docs',
  ]);
  assert.deepEqual(parseCommandLine("node 'a b' ''"), ['node', 'a b', '']);
  assert.equal(parseCommandLine('node "aberto'), null);
});

test('the form produces valid OpenCode MCP entries', () => {
  assert.deepEqual(mcpEntryFromForm({ name: 'github', type: 'local', command: 'npx -y srv' }), {
    name: 'github',
    entry: { type: 'local', command: ['npx', '-y', 'srv'], enabled: true },
  });
  assert.deepEqual(mcpEntryFromForm({ name: 'docs', type: 'remote', url: 'https://x.dev/mcp' }), {
    name: 'docs',
    entry: { type: 'remote', url: 'https://x.dev/mcp', enabled: true },
  });
  assert.ok(mcpEntryFromForm({ name: 'mesp_computer', type: 'local', command: 'x' }).error);
  assert.ok(mcpEntryFromForm({ name: 'a b', type: 'local', command: 'x' }).error);
  assert.ok(mcpEntryFromForm({ name: 'x', type: 'remote', url: 'http://evil.test' }).error);
  assert.ok(mcpEntryFromForm({ name: 'x', type: 'remote', url: 'http://localhost:3000' }).entry);
  assert.ok(mcpEntryFromForm({ name: 'x', type: 'local', command: '   ' }).error);
});

test('listing hides MESP servers and edits keep the rest of the config', () => {
  let config = {
    model: '9router/auto',
    mcp: { mesp_computer: { type: 'local', command: ['node'] } },
  };
  config = withMcpServer(config, 'b', { type: 'remote', url: 'https://b.dev', enabled: true });
  config = withMcpServer(config, 'a', { type: 'local', command: ['npx', 'a'], enabled: true });
  config = withMcpEnabled(config, 'a', false);
  assert.deepEqual(listMcpServers(config), [
    { name: 'a', type: 'local', target: 'npx a', enabled: false },
    { name: 'b', type: 'remote', target: 'https://b.dev', enabled: true },
  ]);
  config = withoutMcpServer(withoutMcpServer(config, 'b'), 'mesp_computer');
  assert.deepEqual(Object.keys(config.mcp).sort(), ['a', 'mesp_computer']);
  assert.equal(config.model, '9router/auto');
});

test('skill front matter is read', () => {
  assert.deepEqual(
    parseSkillFile('---\r\nname: "revisor"\r\ndescription: Revisa PRs\r\n---\r\n# Corpo'),
    { name: 'revisor', description: 'Revisa PRs' },
  );
  assert.equal(parseSkillFile('# sem front matter'), null);
});
