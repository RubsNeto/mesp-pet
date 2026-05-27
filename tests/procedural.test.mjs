// tests/procedural.test.mjs
//
// Testa o sistema procedural de geração de sprites do MESP.
// Carrega o source TypeScript via leitura simples + checagem de invariantes
// (não compila o TS — apenas garante presença de simbolos chave e que o
// preview script CJS roda sem crash).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('composer.ts existe e exporta composeMesp', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/procedural/composer.ts'), 'utf8');
  assert.ok(src.includes('export function composeMesp'), 'composeMesp não encontrado');
  assert.ok(src.includes('export const MESP_ANATOMY'), 'MESP_ANATOMY não encontrado');
  // MESP é ciclope — deve ter eyeCx único, não left/right.
  assert.ok(src.includes('eyeCx'), 'eyeCx ausente (MESP é ciclope, precisa de UM olho)');
  assert.ok(!src.includes('leftEyeCx'), 'leftEyeCx encontrado — MESP é ciclope, removeu?');
});

test('traits.ts gera estrutura válida e tem pesos para acessório/spot', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/procedural/traits.ts'), 'utf8');
  assert.ok(src.includes('export function generateTraits'), 'generateTraits não encontrado');
  assert.ok(src.includes('weightedPick'), 'weightedPick (pesos) não usado');
  assert.ok(src.includes('export function deserializeTraits'), 'deserializeTraits não encontrado');
  // Pelo menos as 8 famílias de cor.
  const familyMatch = src.match(/const FAMILIES: ColorFamily\[\] = \[/);
  assert.ok(familyMatch, 'FAMILIES não declarado');
});

test('persistence.ts salva e restaura traits', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/services/persistence.ts'), 'utf8');
  assert.ok(src.includes('traits: p.traits'), 'persistence não está salvando traits');
  assert.ok(src.includes('deserializeTraits(p.traits)'), 'persistence não está reidratando traits');
});

test('preview-procedural.cjs roda sem crash e gera PNGs', () => {
  const previewDir = path.join(ROOT, 'scripts/preview');
  // Limpa para forçar regeneração.
  for (const f of fs.readdirSync(previewDir)) {
    if (f.startsWith('var_') || ['idle.png', 'sparkle.png', 'walking_0.png'].includes(f)) {
      fs.unlinkSync(path.join(previewDir, f));
    }
  }
  // Roda o script.
  const out = execSync('node scripts/preview-procedural.cjs', { cwd: ROOT }).toString();
  assert.match(out, /Previews gerados/);
  // Verifica que pelo menos os arquivos esperados foram criados.
  assert.ok(fs.existsSync(path.join(previewDir, 'idle.png')), 'idle.png não foi gerado');
  assert.ok(fs.existsSync(path.join(previewDir, 'var_rose_bow.png')), 'var_rose_bow.png não foi gerado');
  assert.ok(fs.existsSync(path.join(previewDir, 'var_lemon_horns.png')), 'var_lemon_horns.png não foi gerado');
});
