// src/services/presetsStore.ts
//
// Persistencia (localStorage) da biblioteca de presets nomeados. Logica pura
// em presetsCore.mjs. Emite evento de mudanca para a UI reagir.

import { deserializeLibrary, serializeLibrary } from './presetsCore';
import type { MespPreset, PresetLibrary } from './presetsCore';

const KEY = 'mesp-presets-v1';
export const PRESETS_EVENT = 'mesp-presets-changed';

export type { MespPreset, PresetLibrary };

export function loadLibrary(): PresetLibrary {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { presets: [], primaryId: null };
    return deserializeLibrary(JSON.parse(raw));
  } catch {
    return { presets: [], primaryId: null };
  }
}

export function saveLibrary(presets: MespPreset[], primaryId: string | null): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(serializeLibrary(presets, primaryId)));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(PRESETS_EVENT, { detail: { presets, primaryId } }));
  } catch {
    /* sem window */
  }
}

export function onPresetsChanged(cb: (lib: PresetLibrary) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as PresetLibrary | undefined;
    cb(detail ?? loadLibrary());
  };
  window.addEventListener(PRESETS_EVENT, handler);
  return () => window.removeEventListener(PRESETS_EVENT, handler);
}
