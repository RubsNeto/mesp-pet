// src/services/contextStore.ts
//
// Persistencia (localStorage) do contexto de projeto e da biblioteca de prompts.
// A logica pura (validacao/normalizacao/defaults) vive em contextCore.mjs e e
// testada isoladamente. Aqui so cuidamos das chaves e do JSON.

import {
  defaultProjectContext,
  normalizeProjectContext,
  defaultPrompts,
  normalizePrompts,
  contextKeyFor,
  makePromptId,
} from "./contextCore";
import type { ProjectContext, PromptItem } from "./contextCore";

export type { ProjectContext, PromptItem };
export { makePromptId };

const CTX_KEY = "mesp-context-v1";
const PROMPTS_KEY = "mesp-prompts-v1";

type ContextMap = Record<string, ProjectContext>;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage cheio/indisponivel */
  }
}

export function loadContext(workDir: string | null | undefined): ProjectContext {
  const map = readJson<ContextMap>(CTX_KEY) ?? {};
  const entry = map[contextKeyFor(workDir)];
  return entry ? normalizeProjectContext(entry) : defaultProjectContext();
}

export function saveContext(workDir: string | null | undefined, ctx: ProjectContext): void {
  const map = readJson<ContextMap>(CTX_KEY) ?? {};
  map[contextKeyFor(workDir)] = normalizeProjectContext(ctx);
  writeJson(CTX_KEY, map);
}

export function loadPrompts(): PromptItem[] {
  const raw = readJson<unknown>(PROMPTS_KEY);
  if (raw == null) return defaultPrompts();
  return normalizePrompts(raw);
}

export function savePrompts(prompts: PromptItem[]): void {
  writeJson(PROMPTS_KEY, normalizePrompts(prompts));
}