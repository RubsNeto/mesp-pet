// src/services/contextCore.d.ts
export interface ProjectContext {
  notes: string;
  pinnedFiles: string[];
}
export interface PromptItem {
  id: string;
  title: string;
  body: string;
}
export function defaultProjectContext(): ProjectContext;
export function normalizeProjectContext(obj: unknown): ProjectContext;
export function makePromptId(): string;
export function defaultPrompts(): PromptItem[];
export function normalizePrompts(arr: unknown): PromptItem[];
export function contextKeyFor(workDir: string | null | undefined): string;