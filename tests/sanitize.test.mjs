// tests/sanitize.test.mjs
//
// Testa o saneamento de argumentos de shell usado em electron/main.ts.
// Replica a função aqui para evitar carregar o main do Electron (que depende
// de electron runtime). O comportamento DEVE ser idêntico — se você mudar a
// função em main.ts, atualize aqui também.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Implementação espelhada (deve casar com electron/main.ts).
function sanitizeArg(arg) {
  return arg.replace(/[;|&`$(){}[\]<>\n\r\0]/g, '');
}

test('main.ts continua exportando/usando sanitizeArg com caracteres conhecidos', () => {
  const src = fs.readFileSync(path.join(ROOT, 'electron/main.ts'), 'utf8');
  // Garante que a regex abrange todos os caracteres perigosos esperados.
  assert.ok(src.includes("sanitizeArg"), 'sanitizeArg não encontrado em main.ts');
  assert.match(src, /\[;\|&`\$\(\)\{\}\[\\\]<>\\n\\r\\0\]/);
});

test('remove metacaracteres de shell', () => {
  assert.equal(sanitizeArg('echo; rm -rf /'), 'echo rm -rf /');
  assert.equal(sanitizeArg('a | b'), 'a  b');
  assert.equal(sanitizeArg('a && b'), 'a  b');
  assert.equal(sanitizeArg('$(whoami)'), 'whoami');
  assert.equal(sanitizeArg('`whoami`'), 'whoami');
  assert.equal(sanitizeArg('a > /etc/passwd'), 'a  /etc/passwd');
  assert.equal(sanitizeArg('a < /etc/passwd'), 'a  /etc/passwd');
  assert.equal(sanitizeArg('${HOME}'), 'HOME');
  assert.equal(sanitizeArg('a\nb\rc\0d'), 'abcd');
  assert.equal(sanitizeArg('a[1]b'), 'a1b');
});

test('preserva caracteres normais', () => {
  assert.equal(sanitizeArg('hello world'), 'hello world');
  assert.equal(sanitizeArg('--flag=value'), '--flag=value');
  assert.equal(sanitizeArg('/path/to/file.txt'), '/path/to/file.txt');
  assert.equal(sanitizeArg('C:\\Users\\test'), 'C:\\Users\\test');
  assert.equal(sanitizeArg('arg-with-dash_and_underscore'), 'arg-with-dash_and_underscore');
});

test('lida com strings vazias e edge cases', () => {
  assert.equal(sanitizeArg(''), '');
  assert.equal(sanitizeArg('   '), '   '); // espaços não são removidos
  assert.equal(sanitizeArg(';;;|||'), '');
});

// Padrões usados na validação de IPC (devem rejeitar inputs maliciosos).
const COMMAND_PATTERN = /^[A-Za-z0-9_./\\:\-+ ]{1,512}$/;
const PETID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RUNID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

test('PETID_PATTERN aceita ids válidos', () => {
  assert.ok(PETID_PATTERN.test('mesp-1'));
  assert.ok(PETID_PATTERN.test('pet_42'));
  assert.ok(PETID_PATTERN.test('a'.repeat(64)));
});

test('PETID_PATTERN rejeita ids maliciosos', () => {
  assert.ok(!PETID_PATTERN.test(''));
  assert.ok(!PETID_PATTERN.test('a'.repeat(65)));
  assert.ok(!PETID_PATTERN.test('mesp; rm -rf /'));
  assert.ok(!PETID_PATTERN.test('../etc/passwd'));
  assert.ok(!PETID_PATTERN.test('mesp\nworker'));
  assert.ok(!PETID_PATTERN.test('mesp\u0000id'));
});

test('COMMAND_PATTERN aceita comandos válidos', () => {
  assert.ok(COMMAND_PATTERN.test('kiro-cli'));
  assert.ok(COMMAND_PATTERN.test('claude'));
  assert.ok(COMMAND_PATTERN.test('/usr/local/bin/kiro'));
  assert.ok(COMMAND_PATTERN.test('C:\\Program Files\\app.exe'));
  assert.ok(COMMAND_PATTERN.test('node-22'));
});

test('COMMAND_PATTERN rejeita injeção', () => {
  assert.ok(!COMMAND_PATTERN.test(''));
  assert.ok(!COMMAND_PATTERN.test('cmd; rm'));
  assert.ok(!COMMAND_PATTERN.test('cmd | other'));
  assert.ok(!COMMAND_PATTERN.test('cmd\nrm'));
  assert.ok(!COMMAND_PATTERN.test('cmd $VAR'));
  assert.ok(!COMMAND_PATTERN.test('cmd `x`'));
});

test('RUNID_PATTERN aceita ids gerados pelo bridge', () => {
  assert.ok(RUNID_PATTERN.test('run-1700000000-1'));
  assert.ok(RUNID_PATTERN.test('abc.123_xyz'));
  assert.ok(!RUNID_PATTERN.test('run/../etc'));
  assert.ok(!RUNID_PATTERN.test(''));
});
