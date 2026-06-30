// src/services/settingsStore.ts
//
// Persistencia (localStorage) das configuracoes do app. Logica pura em
// settingsCore.mjs (testada). Aqui so a chave, o JSON e um evento de mudanca
// para os componentes reagirem (mesmo processo/janela).

import { defaultSettings, normalizeSettings } from "./settingsCore";
import type { AppSettings } from "./settingsCore";

export type { AppSettings };
export { normalizeSettings, defaultSettings };

const KEY = "mesp-settings-v1";
export const SETTINGS_EVENT = "mesp-settings-changed";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings): void {
  const normalized = normalizeSettings(settings);
  try {
    localStorage.setItem(KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: normalized }));
  } catch {
    /* ambiente sem window */
  }
}

/** Assina mudancas de settings; devolve funcao de cleanup. */
export function onSettingsChanged(cb: (s: AppSettings) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as AppSettings | undefined;
    cb(detail ?? loadSettings());
  };
  window.addEventListener(SETTINGS_EVENT, handler);
  return () => window.removeEventListener(SETTINGS_EVENT, handler);
}