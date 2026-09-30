import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classicDockTraits,
  generateDockTraits,
  simplifyDockTraits,
} from '../src/procedural/dockTraits.mjs';
import { FAMILIES, makeTraits } from '../src/procedural/traitsCatalog.mjs';

test('saved ornate MESP keeps its colour and name while returning to the classic silhouette', () => {
  const ornate = makeTraits({
    family: 'mint',
    name: 'Meu MESP',
    bodyShape: 'star',
    eyeCount: 3,
    tuft: 'spiky',
    accessories: ['crown', 'glasses'],
    back: 'wings',
    held: 'balloon',
    neck: 'scarf',
    material: 'jelly',
    gradient: true,
    blush: true,
    spots: 'stars',
    marks: 'heartcheek',
    aura: 'sparkles',
    animStyle: 'jitter',
  });
  const original = structuredClone(ornate);
  const cleaned = simplifyDockTraits(ornate);
  assert.equal(cleaned.name, ornate.name);
  assert.equal(cleaned.family, ornate.family);
  for (const field of ['bodyHi', 'bodyMid', 'bodyLo', 'feetHi', 'feetLo', 'belly'])
    assert.equal(cleaned.palette[field], ornate.palette[field]);
  assert.equal(cleaned.bodyShape, 'squircle');
  assert.equal(cleaned.eyeCount, 1);
  assert.equal(cleaned.material, 'matte');
  assert.equal(cleaned.gradient, false);
  assert.equal(cleaned.blush, false);
  assert.deepEqual(cleaned.accessories, []);
  for (const field of [
    'accessory',
    'neck',
    'back',
    'held',
    'spots',
    'marks',
    'aura',
    'outlineMode',
  ])
    assert.equal(cleaned[field], 'none');
  assert.equal(cleaned.animStyle, 'breathe');
  assert.equal(cleaned.palette.eyeWhite, '#ffffff');
  assert.deepEqual(ornate, original, 'saved source is not mutated');
  assert.deepEqual(simplifyDockTraits(cleaned), cleaned, 'simplification is stable after reload');
});

test('every new MESP keeps the same anatomy and a different available random colour', () => {
  const mesps = [];
  for (let i = 0; i < 10; i++) {
    const generated = generateDockTraits(mesps, () => (i % 2 ? 0.999 : 0));
    assert.ok(!mesps.some((mesp) => mesp.family === generated.family));
    assert.equal(generated.bodyShape, 'squircle');
    assert.equal(generated.tuft, 'drop');
    assert.equal(generated.eyeCount, 1);
    assert.deepEqual(generated.accessories, []);
    mesps.push(generated);
  }
  assert.equal(new Set(mesps.map((mesp) => mesp.palette.bodyMid)).size, 10);
});

test('colour generation remains usable if every family is already present', () => {
  const existing = FAMILIES.map((family) => makeTraits({ family: family.name }));
  const generated = generateDockTraits(existing, () => 0.5);
  assert.ok(FAMILIES.some((family) => family.name === generated.family));
  assert.equal(generated.bodyShape, 'squircle');
  assert.deepEqual(generated.accessories, []);
});

test('explicit customization keeps the chosen accessories and preserves the classic anatomy', () => {
  const customized = makeTraits({
    family: 'sky',
    accessories: ['cap', 'glasses'],
    neck: 'scarf',
    held: 'coffee',
    bodyShape: 'star',
    eyeCount: 3,
  });
  const saved = classicDockTraits(customized);
  assert.deepEqual(saved.accessories, ['cap', 'glasses']);
  assert.equal(saved.neck, 'scarf');
  assert.equal(saved.held, 'coffee');
  assert.equal(saved.bodyShape, 'squircle');
  assert.equal(saved.eyeCount, 1);
  assert.deepEqual(classicDockTraits(saved), saved);
  assert.deepEqual(generateDockTraits([saved], () => 0).accessories, []);
});
