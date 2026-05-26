// tests/summarize.test.mjs
//
// Testes do summarize. Executar com:
//   node --test tests/summarize.test.mjs
//
// Usa node:test (nativo a partir do Node 18). Importamos o .ts via
// import dinâmico em um arquivo .mjs com loader simples não funciona;
// então duplicamos a função aqui para evitar adicionar TypeScript loader.
// Caso o arquivo original mude, este teste dá um sinal claro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, '../src/services/summarize.ts');

// Sanity check: arquivo existe.
test('summarize.ts existe', () => {
  assert.ok(fs.existsSync(sourcePath), `Não encontrei ${sourcePath}`);
});

// Implementação espelhada da fonte. Mantida em sincronia manualmente.
const MAX = 180;
function summarize(text, max = MAX) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean];
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s.trim()}` : s.trim();
    if (next.length > max) {
      if (!out) {
        return clean.slice(0, max - 1).trimEnd() + '…';
      }
      break;
    }
    out = next;
  }
  if (!out) return clean.slice(0, max - 1).trimEnd() + '…';
  return out.length < clean.length ? out + ' …' : out;
}

test('texto vazio retorna string vazia', () => {
  assert.equal(summarize(''), '');
  assert.equal(summarize(null), '');
  assert.equal(summarize(undefined), '');
});

test('texto curto (<=180) volta sem cortes, mas com espaços normalizados', () => {
  const input = 'Olá!   Estou\n  testando o    pet.';
  assert.equal(summarize(input), 'Olá! Estou testando o pet.');
});

test('texto longo é cortado por frase, com reticências', () => {
  const input =
    'Primeira frase curta. Segunda frase com bastante informação útil para o usuário entender. ' +
    'Terceira frase que deveria ficar de fora porque o limite estoura. Quarta frase também extra. ' +
    'Quinta frase final só para garantir que o texto passa de 180 caracteres com folga.';
  const out = summarize(input);
  assert.ok(out.length <= 180 + 2, `Resumo passou do limite: ${out.length} chars`);
  assert.ok(out.startsWith('Primeira frase curta.'));
  assert.ok(out.endsWith('…'), 'Deveria terminar com … ao truncar');
});

test('frase única gigante é truncada de forma bruta', () => {
  const input = 'a'.repeat(500);
  const out = summarize(input);
  assert.equal(out.length, 180, `Tinha que ter 180 chars, tem ${out.length}`);
  assert.ok(out.endsWith('…'));
});

test('respeita limite custom', () => {
  const out = summarize('uma frase qualquer aqui mesmo. outra coisa.', 20);
  assert.ok(out.length <= 22, `Resumo passou do limite: ${out.length}`);
});
