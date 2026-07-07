// tests/traitsCatalog.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(
  pathToFileURL(path.resolve(__dirname, '../src/procedural/traitsCatalog.mjs')).href
);
const {
  FAMILIES,
  SPOT_COLORS,
  ACCESSORIES,
  SPOT_PATTERNS,
  ACCESSORY_LABELS,
  SPOT_LABELS,
  FAMILY_LABELS,
  findFamily,
  buildPaletteFromFamily,
  applyPaletteOverride,
  makeTraits,
  darken,
} = mod;

test('catalogos nao estao vazios e tem os tamanhos esperados', () => {
  assert.equal(FAMILIES.length, 18);
  assert.equal(SPOT_COLORS.length, 6);
  assert.equal(ACCESSORIES.length, 22);
  assert.equal(SPOT_PATTERNS.length, 11);
});

test('familias tem os campos hi/mid/lo/belly como hex', () => {
  for (const f of FAMILIES) {
    for (const key of ['hi', 'mid', 'lo', 'belly']) {
      assert.match(f[key], /^#[0-9a-f]{6}$/i, `${f.name}.${key} nao e hex`);
    }
  }
});

test('todo acessorio e padrao tem rotulo', () => {
  for (const a of ACCESSORIES) assert.ok(ACCESSORY_LABELS[a], `sem rotulo p/ ${a}`);
  for (const s of SPOT_PATTERNS) assert.ok(SPOT_LABELS[s], `sem rotulo p/ ${s}`);
  for (const f of FAMILIES) assert.ok(FAMILY_LABELS[f.name], `sem rotulo p/ ${f.name}`);
});

test('findFamily retorna a familia certa e faz fallback p/ sky', () => {
  assert.equal(findFamily('rose').name, 'rose');
  assert.equal(findFamily('inexistente').name, 'sky');
});

test('darken escurece uma cor', () => {
  assert.equal(darken('#ffffff', 0.5), '#808080');
  assert.equal(darken('#ffffff', 0), '#ffffff');
  assert.equal(darken('#000000', 0.5), '#000000');
});

test('buildPaletteFromFamily deriva body/belly/feet da familia', () => {
  const fam = findFamily('mint');
  const p = buildPaletteFromFamily('mint');
  assert.equal(p.bodyHi, fam.hi);
  assert.equal(p.bodyMid, fam.mid);
  assert.equal(p.bodyLo, fam.lo);
  assert.equal(p.belly, fam.belly);
  // feetHi = lo da familia; feetLo = lo escurecido.
  assert.equal(p.feetHi, fam.lo);
  assert.equal(p.feetLo, darken(fam.lo, 0.25));
  // campos invariantes preservados.
  assert.equal(p.outline, '#162033');
  assert.equal(p.eyeWhite, '#ffffff');
});

test('applyPaletteOverride mescla sem mutar o original', () => {
  const base = buildPaletteFromFamily('sky');
  const next = applyPaletteOverride(base, { bodyMid: '#123456', outline: '#000000' });
  assert.equal(next.bodyMid, '#123456');
  assert.equal(next.outline, '#000000');
  // resto preservado
  assert.equal(next.bodyHi, base.bodyHi);
  // original intacto
  assert.notEqual(base.bodyMid, '#123456');
});

test('makeTraits produz traits completo com defaults', () => {
  const t = makeTraits({ family: 'coral' });
  assert.equal(t.family, 'coral');
  assert.equal(t.accessory, 'none');
  assert.equal(t.spots, 'none');
  assert.equal(t.spotColor, '#ffffff');
  assert.equal(t.palette.bodyMid, findFamily('coral').mid);
});

test('makeTraits aceita escolhas e override de paleta', () => {
  const t = makeTraits({
    family: 'lilac',
    accessory: 'bow',
    spots: 'heart',
    spotColor: '#ff0000',
    paletteOverride: { bodyHi: '#abcdef' },
  });
  assert.equal(t.accessory, 'bow');
  assert.equal(t.spots, 'heart');
  assert.equal(t.spotColor, '#ff0000');
  assert.equal(t.palette.bodyHi, '#abcdef');
});
