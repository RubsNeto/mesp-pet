// src/services/primaryCore.mjs
//
// Logica PURA de serializacao do "MESP principal" (o visual que aparece ao
// abrir o app). Sem localStorage — testado em tests/primaryStore.test.mjs.
//
// Formato persistido: { version, traits, savedAt }. `traits` e um MespTraits
// (validado/reidratado por deserializeTraits do modulo de traits).

export const PRIMARY_SCHEMA_VERSION = 1;

/**
 * Valida e reidrata um MespTraits vindo de fonte nao confiavel.
 * Reproduz deserializeTraits de traits.ts (sem depender do modulo TS), com
 * merge dos campos invariantes de paleta.
 * @param {unknown} raw
 * @returns {object|null}
 */
export function deserializeTraits(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw;
  if (!r.palette || typeof r.palette !== 'object') return null;
  const INVARIANT = { outline: '#162033', eyeWhite: '#ffffff', pupil: '#162033', zzz: '#cdd6f4' };
  const accessories = Array.isArray(r.accessories)
    ? r.accessories.filter((a) => typeof a === 'string' && a !== 'none')
    : r.accessory && r.accessory !== 'none'
      ? [r.accessory]
      : [];
  const scale = typeof r.scale === 'number' && Number.isFinite(r.scale)
    ? Math.max(0.6, Math.min(1.6, r.scale))
    : 1;
  return {
    palette: { ...INVARIANT, ...r.palette },
    accessory: accessories[0] ?? (typeof r.accessory === 'string' ? r.accessory : 'none'),
    accessories,
    spots: typeof r.spots === 'string' ? r.spots : 'none',
    spotColor: typeof r.spotColor === 'string' && r.spotColor ? r.spotColor : '#ffffff',
    family: typeof r.family === 'string' && r.family ? r.family : 'custom',
    name: typeof r.name === 'string' ? r.name : '',
    eyeStyle: typeof r.eyeStyle === 'string' ? r.eyeStyle : 'round',
    tuft: typeof r.tuft === 'string' ? r.tuft : 'drop',
    mouth: typeof r.mouth === 'string' ? r.mouth : 'none',
    blush: typeof r.blush === 'boolean' ? r.blush : false,
    blushColor: typeof r.blushColor === 'string' && r.blushColor ? r.blushColor : '#ff9dbb',
    gradient: typeof r.gradient === 'boolean' ? r.gradient : false,
    gradientDir: typeof r.gradientDir === 'string' ? r.gradientDir : 'vertical',
    scale,
    bodyShape: typeof r.bodyShape === 'string' ? r.bodyShape : 'squircle',
    eyeCount: r.eyeCount === 2 || r.eyeCount === 3 ? r.eyeCount : 1,
    brows: typeof r.brows === 'string' ? r.brows : 'none',
    neck: typeof r.neck === 'string' ? r.neck : 'none',
    back: typeof r.back === 'string' ? r.back : 'none',
    held: typeof r.held === 'string' ? r.held : 'none',
    material: typeof r.material === 'string' ? r.material : 'matte',
    marks: typeof r.marks === 'string' ? r.marks : 'none',
    outlineMode: typeof r.outlineMode === 'string' ? r.outlineMode : 'dark',
    aura: typeof r.aura === 'string' ? r.aura : 'none',
    animStyle: typeof r.animStyle === 'string' ? r.animStyle : 'breathe',
  };
}

/**
 * Serializa traits para o formato persistido.
 * @param {object} traits
 * @returns {{version:number, traits:object, savedAt:number}}
 */
export function serializePrimary(traits) {
  return {
    version: PRIMARY_SCHEMA_VERSION,
    traits,
    savedAt: Date.now(),
  };
}

/**
 * Reidrata o estado persistido do MESP principal.
 * Retorna os traits ou null se invalido/versao incompativel.
 * @param {unknown} raw
 * @returns {object|null}
 */
export function deserializePrimary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw;
  if (data.version !== PRIMARY_SCHEMA_VERSION) return null;
  return deserializeTraits(data.traits);
}
