import type { AgentHistory } from './dockAgent.mjs';
export interface TaskIntent {
  action: 'execute' | 'conversation';
  workspace: 'new' | 'existing' | 'none';
  web: boolean;
  source?: 'model' | 'fallback';
  cancelled?: boolean;
}
export interface IntentRequest {
  petId: string;
  requestId: string;
  prompt: string;
  history?: AgentHistory[];
  cwd?: string | null;
}
export const intentInstructions: string;
export function parseTaskIntent(value: unknown): TaskIntent | null;
export function fallbackTaskIntent(prompt: string, history?: AgentHistory[]): TaskIntent;
export function intentMessages(
  request: Pick<IntentRequest, 'prompt' | 'history' | 'cwd'>,
): Array<{ role: string; content: string }>;
export function createIntentResolver(options: {
  classify: (
    messages: Array<{ role: string; content: string }>,
    signal: AbortSignal,
  ) => Promise<unknown>;
  timeoutMs?: number;
  cacheMs?: number;
}): (request: IntentRequest, signal?: AbortSignal) => Promise<TaskIntent>;
