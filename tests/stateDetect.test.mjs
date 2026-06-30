// tests/stateDetect.test.mjs
//
// Testa o motor PURO de detecção de estado (src/services/stateDetect.mjs).
// Esta é a parte mais frágil do MESP (regexes que reagem ao output de várias
// CLIs de IA), então é a que mais precisa de cobertura.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modUrl = pathToFileURL(
  path.resolve(__dirname, '../src/services/stateDetect.mjs'),
).href;

const {
  stripAnsi,
  matchState,
  matchThinking,
  getMarkersForCommand,
  presetIdForCommand,
  GENERIC_MARKERS,
} = await import(modUrl);

const generic = getMarkersForCommand('algumacli');

test('stripAnsi remove cores CSI', () => {
  assert.equal(stripAnsi('\x1b[31merro\x1b[0m'), 'erro');
});

test('stripAnsi remove sequências de cursor e OSC', () => {
  assert.equal(stripAnsi('\x1b[2K\x1b[1Goi'), 'oi');
  assert.equal(stripAnsi('\x1b]0;titulo\x07texto'), 'texto');
});

test('stripAnsi é seguro com string vazia', () => {
  assert.equal(stripAnsi(''), '');
});

test('detecta erro com ✗ no início', () => {
  assert.equal(matchState('✗ algo falhou', generic), 'error');
});

test('detecta erro com "Error:" e Traceback', () => {
  assert.equal(matchState('Error: cannot read file', generic), 'error');
  assert.equal(matchState('Traceback (most recent call last):', generic), 'error');
  assert.equal(matchState('npm ERR! code E404', generic), 'error');
});

test('detecta success com ✓ e com "Done"', () => {
  assert.equal(matchState('✓ tudo certo', generic), 'success');
  assert.equal(matchState('All tasks completed', generic), 'success');
  assert.equal(matchState('Prontinho!', generic), 'success');
});

test('detecta waiting em prompts y/n', () => {
  assert.equal(matchState('Proceed? (y/n)', generic), 'waiting');
  assert.equal(matchState('Overwrite file? [Y/n]', generic), 'waiting');
  assert.equal(matchState('Do you want to continue?', generic), 'waiting');
  assert.equal(matchState('Press enter to continue', generic), 'waiting');
});

test('detecta waiting em português', () => {
  assert.equal(matchState('Você quer prosseguir?', generic), 'waiting');
  assert.equal(matchState('Tem certeza?', generic), 'waiting');
});

test('linha de output normal não dispara estado', () => {
  assert.equal(matchState('apenas uma linha de log qualquer', generic), null);
  assert.equal(matchState('const x = 42;', generic), null);
});

test('prioridade: erro vence waiting/success na mesma linha', () => {
  // "Error" no início deve ganhar mesmo que tenha "done" no fim.
  assert.equal(matchState('Error: done deal failed', generic), 'error');
});

test('matchThinking detecta spinner braille + palavra', () => {
  assert.equal(matchThinking('⠋ Thinking...', generic), 'thinking');
  assert.equal(matchThinking('⠹ Generating response', generic), 'thinking');
  assert.equal(matchThinking('texto sem spinner', generic), null);
});

test('presetIdForCommand mapeia comandos conhecidos', () => {
  assert.equal(presetIdForCommand('claude'), 'claude');
  assert.equal(presetIdForCommand('kiro-cli'), 'kiro');
  assert.equal(presetIdForCommand('aider'), 'aider');
  assert.equal(presetIdForCommand('gh'), 'gh-copilot');
  assert.equal(presetIdForCommand('cursor-agent'), 'cursor');
  assert.equal(presetIdForCommand('desconhecido'), null);
});

test('Kiro: detecta success pelo rodapé "Credits ... Time ...s"', () => {
  const kiro = getMarkersForCommand('kiro-cli');
  assert.equal(matchState('Credits: 3 • Time: 2.4s', kiro), 'success');
});

test('Claude: detecta prompt de aprovação de edição como waiting', () => {
  const claude = getMarkersForCommand('claude');
  assert.equal(matchState('Do you want to make this edit?', claude), 'waiting');
  assert.equal(matchState('❯ 1. Yes', claude), 'waiting');
});

test('marcadores do preset estendem os genéricos (não substituem)', () => {
  const claude = getMarkersForCommand('claude');
  // padrão genérico ainda funciona no preset claude
  assert.equal(matchState('✓ pronto', claude), 'success');
  assert.equal(matchState('Error: x', claude), 'error');
});

test('GENERIC_MARKERS expõe todas as categorias', () => {
  for (const cat of ['thinking', 'working', 'waiting', 'success', 'error']) {
    assert.ok(Array.isArray(GENERIC_MARKERS[cat]), `categoria ${cat} ausente`);
  }
});
