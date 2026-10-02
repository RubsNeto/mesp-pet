export const DOCK_AGENTS: readonly string[];
export const MAX_DOCK_PROJECTS: number;
export interface DockSavedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
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
  completedAt?: number;
  resultSeenAt?: number;
  taskInterrupted?: boolean;
  taskError?: boolean;
}
export function normalizeDockProjects(value: unknown): DockProject[];
export function dockModelHistory(
  messages?: Array<{
    role: 'user' | 'assistant';
    content?: string;
    text?: string;
    status?: string;
  }>,
): Array<{ role: 'user' | 'assistant'; content: string }>;
export function projectName(path: string | null): string;
export function agentCanChange(state: string): boolean;
export function aggregateDockState(states: string[]): string;
export function taskTitle(prompt: string): string;
export function nextDockTaskTitle(prompt: string, previous?: string): string;
export function dockTitleContext(
  project: { projectName?: string; taskTitle?: string },
  prompt: string,
  previousPrompts?: string[],
): string;
export interface DockTaskState {
  state?: string;
  hasActiveTask?: boolean;
  completedAt?: number;
  resultSeenAt?: number;
  taskInterrupted?: boolean;
  taskError?: boolean;
}
export type DockProjectGroup = 'active' | 'attention' | 'completed' | 'ready';
export function dockProjectStatus(project: DockTaskState): {
  group: DockProjectGroup;
  label: string;
};
export function unreadDockResult(project: DockTaskState): boolean;
export function restoreDockTask(saved: unknown): Omit<DockTaskState, 'state' | 'hasActiveTask'>;
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
  | { kind: 'projects'; filter?: 'active' | 'attention' | 'completed' }
  | { kind: 'new-project' | 'new-mesp' | 'customize' | 'collapse' | 'help' }
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
export function dockGreetingReply(text: string): string | null;
export function findDockProject(projects: DockProject[], name: string): string | null;
