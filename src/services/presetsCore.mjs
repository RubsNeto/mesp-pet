// src/services/presetsCore.mjs
//
// Logica PURA da biblioteca de presets nomeados de MESP. Sem localStorage —
// testado em tests/presetsStore.test.mjs. Um preset = { id, name, traits,
// createdAt }. O blob persistido guarda tambem `primaryId` (qual preset e' o
// principal), embora a fonte de verdade do visual de boot seja o primaryStore.

import { deserializeTraits } from './primaryCore.mjs';

export const PRESETS_SCHEMA_VERSION = 1;

let counter = 0;
function genId() {
  counter += 1;
  return `preset-${Date.now().toString(36)}-${counter}`;
}

/** Cria um preset novo (objeto puro). */
export function makePreset(name, traits) {
  return {
    id: genId(),
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : 'Sem nome',
    traits,
    createdAt: Date.now(),
  };
}

/** Adiciona um preset a lista (retorna nova lista). */
export function addPreset(list, name, traits) {
  return [...(Array.isArray(list) ? list : []), makePreset(name, traits)];
}

/** Remove um preset por id. */
export function removePreset(list, id) {
  return (Array.isArray(list) ? list : []).filter((p) => p.id !== id);
}

/** Renomeia um preset. */
export function renamePreset(list, id, name) {
  return (Array.isArray(list) ? list : []).map((p) =>
    p.id === id ? { ...p, name: (name || '').trim().slice(0, 40) || p.name } : p,
  );
}

/** Atualiza os traits de um preset existente. */
export function updatePresetTraits(list, id, traits) {
  return (Array.isArray(list) ? list : []).map((p) => (p.id === id ? { ...p, traits } : p));
}

/** Valida/normaliza a lista de presets vinda de fonte nao confiavel. */
export function normalizePresets(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const traits = deserializeTraits(p.traits);
    if (!traits) continue;
    out.push({
      id: typeof p.id === 'string' && p.id ? p.id : genId(),
      name: typeof p.name === 'string' && p.name ? p.name.slice(0, 40) : 'Sem nome',
      traits,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
    });
  }
  return out;
}

/** Reidrata o blob persistido { version, presets, primaryId }. */
export function deserializeLibrary(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== PRESETS_SCHEMA_VERSION) {
    return { presets: [], primaryId: null };
  }
  return {
    presets: normalizePresets(raw.presets),
    primaryId: typeof raw.primaryId === 'string' ? raw.primaryId : null,
  };
}

/** Serializa o blob persistido. */
export function serializeLibrary(presets, primaryId) {
  return {
    version: PRESETS_SCHEMA_VERSION,
    presets: Array.isArray(presets) ? presets : [],
    primaryId: primaryId ?? null,
  };
}
