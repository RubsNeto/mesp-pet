// tests/kiroBridge.spawn.test.mjs
//
// Garante que o padrão de spawn usado no main do Electron (shell:true no
// Windows, child_process.spawn) funciona com comandos reais do sistema.
// Não importa o módulo do main (que depende do Electron); replica o trecho
// crítico para validar que o ambiente do usuário consegue executar comandos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

function runCmd(cmd, args) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(cmd, args, {
      shell: process.platform === 'win32',
      env: { ...process.env },
    });
    child.stdout.on('data', (c) => (stdout += c.toString()));
    child.stderr.on('data', (c) => (stderr += c.toString()));
    child.on('error', (err) =>
      resolve({ ok: false, code: null, stdout, stderr, error: err.message })
    );
    child.on('close', (code) =>
      resolve({ ok: code === 0, code, stdout, stderr })
    );
  });
}

test('spawn de "node -v" funciona e retorna versão', async () => {
  const r = await runCmd('node', ['-v']);
  assert.equal(r.ok, true, `Esperava ok=true, veio: ${JSON.stringify(r)}`);
  assert.match(r.stdout.trim(), /^v\d+\.\d+\.\d+/);
});

test('spawn de "npm -v" funciona', async () => {
  const r = await runCmd('npm', ['-v']);
  assert.equal(r.ok, true, `Esperava ok=true, veio: ${JSON.stringify(r)}`);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('comando inexistente devolve ok=false sem crashar', async () => {
  const r = await runCmd('comando-que-nao-existe-mesp-xyz', []);
  assert.equal(r.ok, false, 'Comando inexistente deveria retornar ok=false');
  // Pode vir como child.on("error") (error preenchido) ou exit não-zero.
  const isFailure =
    r.error !== undefined || (typeof r.code === 'number' && r.code !== 0);
  assert.ok(isFailure, `Esperava falha, veio: ${JSON.stringify(r)}`);
});
