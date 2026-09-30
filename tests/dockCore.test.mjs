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
} from '../src/services/dockCore.mjs';

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
