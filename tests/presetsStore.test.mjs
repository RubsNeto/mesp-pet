// tests/presetsStore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const core = await import(
  pathToFileURL(path.resolve(__dirname, '../src/services/presetsCore.mjs')).href
);
const catalog = await import(
  pathToFileURL(path.resolve(__dirname, '../src/procedural/traitsCatalog.mjs')).href
);
const {
  makePreset, addPreset, removePreset, renamePreset, updatePresetTraits,
  normalizePresets, deserializeLibrary, serializeLibrary, PRESETS_SCHEMA_VERSION,
} = core;
const { makeTraits } = catalog;

const T = () => makeTraits({ family: 'mint', accessories: ['bow'] });

test('makePreset gera id, corta nome e guarda traits', () => {
  const p = makePreset('Trabalho', T());
  assert.ok(p.id);
  assert.equal(p.name, 'Trabalho');
  assert.equal(p.traits.family, 'mint');
  const long = makePreset('x'.repeat(80), T());
  assert.equal(long.name.length, 40);
  const empty = makePreset('   ', T());
  assert.equal(empty.name, 'Sem nome');
});

test('add/remove/rename/update operam imutavelmente', () => {
  let list = [];
  list = addPreset(list, 'A', T());
  list = addPreset(list, 'B', T());
  assert.equal(list.length, 2);
  const id = list[0].id;
  const renamed = renamePreset(list, id, 'Novo');
  assert.equal(renamed[0].name, 'Novo');
  assert.equal(list[0].name, 'A'); // original intacto
  const t2 = makeTraits({ family: 'coral' });
  const updated = updatePresetTraits(list, id, t2);
  assert.equal(updated[0].traits.family, 'coral');
  const removed = removePreset(list, id);
  assert.equal(removed.length, 1);
});

test('normalizePresets descarta entradas invalidas', () => {
  const ok = makePreset('ok', T());
  const list = normalizePresets([ok, null, 42, { name: 'sem traits' }, { name: 'traits ruim', traits: {} }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'ok');
});

test('serialize/deserialize library round-trip com primaryId', () => {
  const list = addPreset([], 'A', T());
  const blob = serializeLibrary(list, list[0].id);
  assert.equal(blob.version, PRESETS_SCHEMA_VERSION);
  const back = deserializeLibrary(JSON.parse(JSON.stringify(blob)));
  assert.equal(back.presets.length, 1);
  assert.equal(back.primaryId, list[0].id);
});

test('deserializeLibrary rejeita versao incompativel', () => {
  const back = deserializeLibrary({ version: 999, presets: [], primaryId: null });
  assert.deepEqual(back, { presets: [], primaryId: null });
});
