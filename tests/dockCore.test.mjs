import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDockProjects,
  projectName,
  agentCanChange,
  aggregateDockState,
  visibleHitRegions,
  parseDockRequest,
  findDockProject,
  taskTitle,
  shouldPromoteProject,
  isTaskCompletion,
  terminalReply,
  readDockDrafts,
  serializeDockDrafts,
  readDockConversations,
  serializeDockConversations,
} from '../src/services/dockCore.mjs';

test('chat history rejects damaged saves, removed projects and invalid messages', () => {
  for (const raw of ['{broken', 'null', '[]', '"text"'])
    assert.deepEqual(readDockConversations(raw, ['mesp-a']), {});
  const raw = JSON.stringify({
    'mesp-a': [
      null,
      { id: 'old', role: 'assistant', content: 'old duplicate' },
      { id: 'bad', role: 'system', content: 'not a chat message' },
      { id: 'blank', role: 'assistant', content: '' },
      { id: 'old', role: 'user', content: '  ç 🐾\nlinha 2  ', private: 'ignored' },
    ],
    'mesp-removed': [{ id: 'removed', role: 'user', content: 'Removed' }],
  });
  assert.deepEqual(readDockConversations(raw, ['mesp-a']), {
    'mesp-a': [{ id: 'old', role: 'user', content: '  ç 🐾\nlinha 2  ' }],
  });
});
test('chat history keeps recent turns within a per-project storage budget', () => {
  const messages = Array.from({ length: 150 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 ? 'assistant' : 'user',
    content: `Message ${index}`,
  }));
  const saved = readDockConversations(
    serializeDockConversations({ 'mesp-a': messages }, ['mesp-a']),
    ['mesp-a'],
  );
  assert.equal(saved['mesp-a'].length, 100);
  assert.equal(saved['mesp-a'][0].id, 'message-50');
  assert.equal(saved['mesp-a'][99].content, 'Message 149');
  const long = Array.from({ length: 10 }, (_, index) => ({
    id: `long-${index}`,
    role: 'assistant',
    content: 'x'.repeat(30000),
  }));
  const bounded = JSON.parse(serializeDockConversations({ 'mesp-a': long }, ['mesp-a']))['mesp-a'];
  assert.equal(bounded.length, 5);
  assert.equal(bounded[0].id, 'long-5');
  assert.equal(
    bounded.reduce((sum, message) => sum + message.content.length, 0),
    120000,
  );
});
test('chat history roundtrip preserves code and only saves existing projects', () => {
  const message = {
    id: 'code',
    role: 'assistant',
    content: 'Resultado:\n```ts\nconst total = 42;\n```',
  };
  const raw = serializeDockConversations({ 'mesp-a': [message], 'mesp-old': [message] }, [
    'mesp-a',
    'mesp-empty',
  ]);
  assert.deepEqual(JSON.parse(raw), { 'mesp-a': [message] });
  assert.deepEqual(readDockConversations(raw, ['mesp-a']), { 'mesp-a': [message] });
});

test('conversational settings and help commands open local controls without becoming agent prompts', () => {
  for (const text of ['Ajuda', 'O que posso pedir?', 'Como usar o MESP?'])
    assert.deepEqual(parseDockRequest(text), { kind: 'help' });
  for (const [text, page] of [
    ['Configurações', 'overview'],
    ['Escolher modelo', 'overview'],
    ['Ver consumo', 'usage'],
    ['Ver cotas', 'quota'],
    ['Gerenciar contas', 'providers'],
    ['Conectar Codex', 'codex'],
    ['Conectar Claude Code', 'claude'],
    ['Conectar Gemini', 'gemini-cli'],
    ['Configurar ferramentas', 'cli-tools'],
  ])
    assert.deepEqual(parseDockRequest(text), { kind: 'settings', page });
  for (const text of [
    'Implemente uma página de configurações',
    'Conectar Codex ao meu backend',
    'Verifique o consumo de memória do projeto',
  ])
    assert.deepEqual(parseDockRequest(text), { kind: 'send', prompt: text });
});
test('task names can select a MESP sharing the same folder without guessing ambiguous names', () => {
  const projects = [
    { id: 'mesp-a', name: 'Loja', taskTitle: 'Revisar pagamentos' },
    { id: 'mesp-b', name: 'Loja', taskTitle: 'Revisar carrinho' },
  ];
  assert.deepEqual(parseDockRequest('Abrir MESP Revisar pagamentos'), {
    kind: 'select-project',
    name: 'revisar pagamentos',
  });
  assert.equal(findDockProject(projects, 'Revisar pagamentos'), 'mesp-a');
  assert.equal(findDockProject(projects, 'carrinho'), 'mesp-b');
  assert.equal(findDockProject(projects, 'Revisar'), null);
  assert.equal(findDockProject(projects, 'Loja'), null);
});
test('draft restore tolerates damaged saves and ignores removed projects and invalid text', () => {
  assert.deepEqual([...readDockDrafts('{broken', ['mesp-a'])], []);
  assert.deepEqual([...readDockDrafts('{"mesp-a":"old format"}', ['mesp-a'])], []);
  assert.deepEqual(
    [
      ...readDockDrafts(
        JSON.stringify([
          ['mesp-a', '  Revisão ç 🐾\nlinha 2  '],
          ['mesp-removed', 'private draft'],
          ['mesp-a', 2],
          null,
        ]),
        ['mesp-a'],
      ),
    ],
    [['mesp-a', '  Revisão ç 🐾\nlinha 2  ']],
  );
});
test('draft save only retains existing projects with unfinished text', () => {
  const saved = serializeDockDrafts(
    new Map([
      ['mesp-a', 'Ainda escrevendo'],
      ['mesp-b', ''],
      ['mesp-removed', 'Removed'],
    ]),
    ['mesp-a', 'mesp-b'],
  );
  assert.deepEqual(JSON.parse(saved), [['mesp-a', 'Ainda escrevendo']]);
});

test('project restore rejects malformed entries and keeps distinct folders with their agents', () => {
  assert.deepEqual(normalizeDockProjects(null), []);
  const entries = normalizeDockProjects([
    { id: 'mesp-a', name: '  Loja  ', workDir: 'C:\\Loja', agent: 'claude' },
    { id: 'mesp-a', name: 'duplicate', workDir: 'D:\\Other', agent: 'codex' },
    null,
    { id: 'bad', workDir: null },
    { id: 'mesp-empty', workDir: '  ' },
    { id: 'mesp-b', workDir: '/work/service/', agent: 'missing' },
  ]);
  assert.deepEqual(entries, [
    { id: 'mesp-a', name: 'Loja', workDir: 'C:\\Loja', agent: 'claude' },
    { id: 'mesp-b', name: 'service', workDir: '/work/service/', agent: 'codex' },
  ]);
});
test('restore caps projects at 10 without discarding their agent selection', () => {
  const saved = Array.from({ length: 14 }, (_, i) => ({
    id: `mesp-${i}`,
    workDir: null,
    agent: i % 2 ? 'claude' : 'codex',
  }));
  assert.equal(normalizeDockProjects(saved).length, 10);
  assert.equal(normalizeDockProjects(saved)[9].agent, 'claude');
});
test('folder labels support Windows and POSIX paths, including trailing separators', () => {
  assert.equal(projectName('C:\\Users\\ruben\\Meu Projeto\\'), 'Meu Projeto');
  assert.equal(projectName('/work/api/'), 'api');
  assert.equal(projectName(null), 'Meu primeiro projeto');
});
test('active tasks cannot be replaced while other projects remain selectable', () => {
  for (const state of ['thinking', 'working', 'waiting'])
    assert.equal(agentCanChange(state), false);
  for (const state of ['idle', 'success', 'error', 'sleeping'])
    assert.equal(agentCanChange(state), true);
  assert.equal(aggregateDockState(['working', 'waiting', 'idle']), 'waiting');
  assert.equal(aggregateDockState(['working', 'error']), 'error');
  assert.equal(aggregateDockState([]), 'idle');
});
test('native click-through only accepts bounded finite visible rectangles', () => {
  const good = { x: 600, y: 0, width: 288, height: 38 };
  assert.deepEqual(
    visibleHitRegions([
      good,
      { x: 0, y: 0, width: 0, height: 10 },
      { x: NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: Infinity, height: 10 },
      { x: 0, y: 0, width: 30000, height: 10 },
      null,
    ]),
    [good],
  );
  assert.equal(visibleHitRegions(Array.from({ length: 40 }, () => good)).length, 32);
});
test('natural commands route app management without turning coding tasks into folder dialogs', () => {
  assert.deepEqual(parseDockRequest('Abrir projeto'), { kind: 'new-project' });
  assert.deepEqual(parseDockRequest('Crie outro MESP'), { kind: 'new-mesp' });
  assert.deepEqual(parseDockRequest('Meus MESP'), { kind: 'projects' });
  assert.deepEqual(parseDockRequest('Mostre meus projetos.'), { kind: 'projects' });
  assert.deepEqual(parseDockRequest('Chame o Claude'), { kind: 'agent', agent: 'claude' });
  assert.deepEqual(parseDockRequest('Peça ao Codex para revisar o código'), {
    kind: 'delegate',
    agent: 'codex',
    prompt: 'revisar o código',
  });
  assert.deepEqual(parseDockRequest('Claude: explique o projeto'), {
    kind: 'delegate',
    agent: 'claude',
    prompt: 'explique o projeto',
  });
  assert.deepEqual(parseDockRequest('Crie um aplicativo React'), {
    kind: 'send',
    prompt: 'Crie um aplicativo React',
  });
  assert.deepEqual(parseDockRequest('Personalize o MESP'), { kind: 'customize' });
});
test('project selection ignores accents and refuses ambiguous names', () => {
  const projects = [
    { id: 'mesp-a', name: 'Operação', workDir: null, agent: 'codex' },
    { id: 'mesp-b', name: 'Operação Loja', workDir: null, agent: 'claude' },
  ];
  assert.equal(findDockProject(projects, 'operacao'), 'mesp-a');
  assert.equal(findDockProject(projects, 'loja'), 'mesp-b');
  assert.equal(findDockProject(projects, 'oper'), null);
  assert.equal(findDockProject(projects, 'missing'), null);
});

test('titles are readable, persisted and Unicode safe', () => {
  assert.equal(taskTitle('  Revisar\n  o checkout  '), 'Revisar o checkout');
  assert.equal(Array.from(taskTitle('🚀'.repeat(100))).length, 86);
  const [project] = normalizeDockProjects([
    {
      id: 'mesp-title',
      workDir: 'C:\\Loja',
      agent: 'claude',
      taskTitle: 'Meu checkout',
      titlePinned: true,
    },
  ]);
  assert.equal(project.taskTitle, 'Meu checkout');
  assert.equal(project.titlePinned, true);
});
test('only submitted task completion promotes a MESP, never login or a tool check', () => {
  assert.equal(shouldPromoteProject({ state: 'working', hasActiveTask: true }, 'success'), true);
  assert.equal(shouldPromoteProject({ state: 'success', hasActiveTask: true }, 'success'), false);
  assert.equal(shouldPromoteProject({ state: 'idle' }, 'success'), false);
  assert.equal(shouldPromoteProject({ state: 'working', hasActiveTask: true }, 'idle'), false);
  assert.equal(isTaskCompletion('Task completed.'), true);
  assert.equal(isTaskCompletion('Tarefa concluída'), true);
  assert.equal(isTaskCompletion('Done!'), true);
  assert.equal(isTaskCompletion('✓ npm test'), false);
  assert.equal(isTaskCompletion('Build completed in 1.4s'), false);
});
test('rendered CLI snapshots become real replies without echoed prompts or ANSI replays', () => {
  assert.equal(
    terminalReply('Ready\nC:\\Loja>', 'Ready\nC:\\Loja>echo hello\nhello\nC:\\Loja>', 'echo hello'),
    'hello\nC:\\Loja>',
  );
  assert.equal(
    terminalReply('Ready\n', 'Ready\n❯ Revisar\nResposta real', 'Revisar'),
    'Resposta real',
  );
  assert.equal(terminalReply('Same', 'Same', 'Task'), '');
});
