// tests/primaryStore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const core = await import(
  pathToFileURL(path.resolve(__dirname, '../src/services/primaryCore.mjs')).href
);
const catalog = await import(
  pathToFileURL(path.resolve(__dirname, '../src/procedural/traitsCatalog.mjs')).href
);
const { serializePrimary, deserializePrimary, PRIMARY_SCHEMA_VERSION } = core;
const { makeTraits } = catalog;

test('round-trip: serializePrimary -> deserializePrimary preserva traits', () => {
  const traits = makeTraits({ family: 'rose', accessory: 'bow', spots: 'heart', spotColor: '#ff0000' });
  const persisted = serializePrimary(traits);
  assert.equal(persisted.version, PRIMARY_SCHEMA_VERSION);
  assert.equal(typeof persisted.savedAt, 'number');
  const back = deserializePrimary(JSON.parse(JSON.stringify(persisted)));
  assert.equal(back.family, 'rose');
  assert.equal(back.accessory, 'bow');
  assert.equal(back.spots, 'heart');
  assert.equal(back.spotColor, '#ff0000');
  assert.equal(back.palette.bodyMid, traits.palette.bodyMid);
});

test('deserializePrimary retorna null p/ entrada invalida', () => {
  assert.equal(deserializePrimary(null), null);
  assert.equal(deserializePrimary(42), null);
  assert.equal(deserializePrimary('nope'), null);
  assert.equal(deserializePrimary({}), null);
});

test('deserializePrimary retorna null p/ versao incompativel', () => {
  const traits = makeTraits({ family: 'sky' });
  const persisted = { version: 999, traits, savedAt: Date.now() };
  assert.equal(deserializePrimary(persisted), null);
});

test('deserializePrimary preenche defaults p/ campos faltando', () => {
  const persisted = { version: PRIMARY_SCHEMA_VERSION, traits: { palette: { bodyMid: '#123456' } }, savedAt: Date.now() };
  const back = deserializePrimary(persisted);
  assert.ok(back);
  assert.equal(back.accessory, 'none');
  assert.equal(back.spots, 'none');
  assert.equal(back.spotColor, '#ffffff');
  assert.equal(back.family, 'custom');
  // campos invariantes de paleta preenchidos
  assert.equal(back.palette.outline, '#162033');
  assert.equal(back.palette.bodyMid, '#123456');
});

test('deserializePrimary retorna null se traits sem palette', () => {
  const persisted = { version: PRIMARY_SCHEMA_VERSION, traits: { accessory: 'bow' }, savedAt: Date.now() };
  assert.equal(deserializePrimary(persisted), null);
});
