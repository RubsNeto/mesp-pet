export const DOCK_AGENTS: readonly string[];
export const MAX_DOCK_PROJECTS: number;
export interface DockSavedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
export function readDockConversations(
  raw: string | null,
  projectIds: string[],
): Record<string, DockSavedMessage[]>;
export function serializeDockConversations(
  conversations: Record<string, DockSavedMessage[]>,
  projectIds: string[],
): string;
export function readDockDrafts(raw: string | null, projectIds: string[]): Map<string, string>;
export function serializeDockDrafts(drafts: Map<string, string>, projectIds: string[]): string;
export interface DockProject {
  id: string;
  name: string;
  workDir: string | null;
  agent: string;
  taskTitle?: string;
  titlePinned?: boolean;
  routerModel?: string;
}
export function normalizeDockProjects(value: unknown): DockProject[];
export function projectName(path: string | null): string;
export function agentCanChange(state: string): boolean;
export function aggregateDockState(states: string[]): string;
export function taskTitle(prompt: string): string;
export function shouldPromoteProject(
  project: { state: string; hasActiveTask?: boolean } | undefined,
  next: string,
): boolean;
export function isTaskCompletion(line: string): boolean;
export function terminalReply(before: string, after: string, prompt: string): string;
export interface HitRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function visibleHitRegions(value: unknown): HitRegion[];
export type DockRequest =
  | { kind: 'projects' | 'new-project' | 'new-mesp' | 'customize' | 'collapse' | 'help' }
  | {
      kind: 'settings';
      page:
        | 'overview'
        | 'usage'
        | 'quota'
        | 'providers'
        | 'cli-tools'
        | 'codex'
        | 'claude'
        | 'gemini-cli';
    }
  | { kind: 'select-project'; name: string }
  | { kind: 'agent'; agent: string }
  | { kind: 'delegate'; agent: string; prompt: string }
  | { kind: 'send'; prompt: string };
export function parseDockRequest(text: string): DockRequest;
export function findDockProject(projects: DockProject[], name: string): string | null;
