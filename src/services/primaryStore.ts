// src/services/primaryStore.ts
//
// Persistencia (localStorage) do "MESP principal" — o visual que aparece ao
// abrir o app. Logica pura em primaryCore.mjs (testada). Aqui so a chave, o
// JSON e um evento de mudanca para os componentes reagirem.

import { serializePrimary, deserializePrimary } from './primaryCore';
import type { MespTraits } from '../procedural/traits';

const KEY = 'mesp-primary-traits-v1';
export const PRIMARY_EVENT = 'mesp-primary-changed';

/** Carrega os traits principais salvos, ou null se nao houver/invalido. */
export function loadPrimaryTraits(): MespTraits | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return deserializePrimary(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Salva os traits como MESP principal e emite evento de mudanca. */
export function savePrimaryTraits(traits: MespTraits): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(serializePrimary(traits)));
  } catch {
    /* storage cheio/indisponivel — ignora */
  }
  try {
    window.dispatchEvent(new CustomEvent(PRIMARY_EVENT, { detail: traits }));
  } catch {
    /* ambiente sem window */
  }
}

/** Remove o MESP principal salvo (volta ao azul padrao no proximo boot). */
export function clearPrimaryTraits(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(PRIMARY_EVENT, { detail: null }));
  } catch {
    /* ambiente sem window */
  }
}

/** Assina mudancas do MESP principal; devolve funcao de cleanup. */
export function onPrimaryChanged(cb: (traits: MespTraits | null) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as MespTraits | null | undefined;
    cb(detail ?? loadPrimaryTraits());
  };
  window.addEventListener(PRIMARY_EVENT, handler);
  return () => window.removeEventListener(PRIMARY_EVENT, handler);
}
