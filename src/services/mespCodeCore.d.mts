export type MespCodeMode = 'fast' | 'plan' | 'assisted' | 'autonomous';

export const MESP_CODE_MODES: readonly MespCodeMode[];
export type ProjectCheckName = 'typecheck' | 'lint' | 'test' | 'build' | 'check';
export const PROJECT_CHECK_NAMES: readonly ProjectCheckName[];
export function isMespCodeMode(value: unknown): value is MespCodeMode;
export function resolveOpenCodeConfigValue(
  value: unknown,
  environment?: Readonly<Record<string, string | undefined>>,
): string | null;
export function parseDotEnvValue(value: unknown): string;
export function isLoopbackRouterURL(value: unknown): boolean;
export function routerOriginForApiBase(value: unknown): string | null;
export function hasActiveRouterConnections(payload: unknown): boolean | null;
export function extractOpenCodeApiCredential(
  authConfig: unknown,
  providerId: string,
): string | null;
export function discoverProjectChecks(packageJson: unknown): ProjectCheckName[];
export function normalizeProjectChecks(
  requested: unknown,
  available: readonly ProjectCheckName[],
): ProjectCheckName[] | null;
export function createBoundedProjectCheckOutput(maxBytes?: number): {
  append(stream: 'stdout' | 'stderr', chunk: unknown): void;
  snapshot(): {
    stdout: string;
    stderr: string;
    bytes: number;
    truncated: boolean;
  };
};
export function enqueueUniqueTask<T extends { id: string }>(
  queue: readonly T[],
  task: T,
  limit?: number,
): { queue: readonly T[]; added: boolean; reason?: 'invalid' | 'duplicate' | 'full' };
export function takeNextQueuedTask<T>(
  queue: readonly T[],
  options?: { paused?: boolean; occupied?: boolean },
): { queue: readonly T[]; task: T | null };
export function shouldPauseQueueAfterVerification(options: {
  automatic: boolean;
  passed: boolean;
  cancelled: boolean;
  pendingCount: number;
}): boolean;
export function projectCheckFinalState(options: {
  cancelled: boolean;
  stopped?: boolean;
  results: Array<{ code: number | null }>;
  expectedCount: number;
}): {
  status: 'passed' | 'failed' | 'cancelled';
  passed: boolean;
  cancelled: boolean;
};
export function normalizeStoredMespMessages(value: unknown, limit?: number): unknown[];
export function normalizeStoredMespQueue(value: unknown, limit?: number): unknown[];
export function buildOpenCodeArgs(options: {
  prompt: string;
  model: string;
  sessionId?: string | null;
  mode: 'plan' | 'autonomous';
}): string[];
export function modelIdFor9Router(model: string): string;
export function buildFastMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  prompt: string,
  options?: { maxMessages?: number; maxChars?: number },
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
export function parseOpenAIStreamData(data: string): {
  text?: string;
  usage?: Record<string, unknown>;
  error?: string;
  done?: boolean;
};
export function extractSSEData(
  buffer: string,
  final?: boolean,
): { data: string[]; remainder: string };
export function totalTokensFromUsage(usage: unknown): number | undefined;
export interface MespTokenUsage {
  total: number;
  input?: number;
  output?: number;
}
export function tokenUsageFromOpenCodeEvent(event: unknown): MespTokenUsage | undefined;
export function addTokenUsage(
  current: MespTokenUsage | undefined,
  next: MespTokenUsage | undefined,
): MespTokenUsage | undefined;
export function publicOpenCodeEvent(event: unknown): Record<string, unknown>;
