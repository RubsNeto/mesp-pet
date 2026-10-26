export interface RouterConnectionSummary {
  provider: string;
  accounts: number;
  active: number;
}
export function routerPage(page: unknown): string;
export function routerConnectionSummary(payload: unknown): RouterConnectionSummary[] | null;
export const AUTO_ROUTER_MODEL: string;
export const ROUTER_PERIODS: string[];
export interface RouterCounters {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  cachedTokens: number;
  cost: number | null;
}
export interface RouterQuota {
  key: string;
  used: number | null;
  total: number | null;
  remaining: number | null;
  usedPercent: number | null;
  resetAt: number | null;
  unlimited: boolean;
}
export interface RouterAccount {
  id: string;
  label: string;
  provider: string;
  providerName: string;
  prefix: string;
  active: boolean;
  health: 'active' | 'disabled' | 'error' | 'auth' | 'unknown';
  quotaState: 'available' | 'unsupported' | 'error';
  plan: string;
  limitReached: boolean;
  quotas: RouterQuota[];
  locks: Array<{ model: string; until: number }>;
  lastFailure: 'permission' | null;
  /** A recent 429 from the provider that no later successful test cleared. */
  rateLimited: boolean;
  consumption: RouterCounters | null;
}
export interface RouterModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  accountIds: string[];
  source: 'live' | 'catalog';
  /** False when no account can serve the model through Auto right now. */
  available: boolean;
  /** Every connected account that may offer the model (accountIds lists the usable ones). */
  ownerIds?: string[];
  /** True when at least one account actually answered with this model. */
  verified?: boolean;
  reason?:
    | 'auth'
    | 'permission'
    | 'quota'
    | 'disabled'
    | 'catalog'
    | 'model'
    | 'pending'
    | 'none'
    | 'unknown';
  supportsTools?: boolean;
  contextLength?: number;
  rateMultiplier?: number;
}
export interface RouterAutoChoice {
  model: string;
  accountId: string;
  accountLabel: string;
  provider: string;
  resetAt: number | null;
  capacity: number | null;
  quality: number;
  quotaKnown: boolean;
  live: boolean;
  level: number;
  fit: number;
  funding: number;
  /** Position of the account's provider in the user's priority list. */
  rank: number;
  /** 2 for Opus, 1 for Sonnet, 0 otherwise; ranks quality when a provider order is set. */
  premium: number;
  rateMultiplier: number | null;
  speed: number;
}
export interface RouterOverview {
  accountSource: 'mesp' | '9router' | 'external';
  updatedAt: number;
  period: string;
  accounts: RouterAccount[];
  models: RouterModel[];
  totals: RouterCounters | null;
  modelsAvailable: boolean;
  usageAvailable: boolean;
  auto: { available: boolean; supported: boolean; next: RouterAutoChoice | null };
}
export function providerName(provider: string): string;
export function routerRunModel(
  route: unknown,
  run: {
    autoModel: boolean;
    cancelled: boolean;
    sessionId: string | null;
    startedAt: number;
  },
): string | null;
export function normalizeRouterQuotas(payload: unknown): RouterQuota[];
export interface RouterRequestClass {
  complexity: 'light' | 'standard' | 'advanced';
  level: number;
  tools: boolean;
  inputChars: number;
}
export function classifyRouterRequest(body?: unknown, purpose?: string): RouterRequestClass;
export function routerModelLevel(model: RouterModel): number;
export function createRouterHealth(saved?: unknown): {
  snapshot(now?: number): Array<[string, number]>;
  available(choice: RouterAutoChoice, now?: number): boolean;
  failed(
    choice: RouterAutoChoice,
    status: number | 'model' | 'empty',
    retryAfter?: string | null,
    now?: number,
  ): void;
};
export function autoRouterCandidates(
  accounts: RouterAccount[],
  models: RouterModel[],
  now?: number,
  request?: RouterRequestClass | null,
  priority?: readonly string[],
): RouterAutoChoice[];
export const ROUTER_FAILURE_WINDOW_MS: number;
export const ROUTER_MODEL_BLOCK_MS: number;
export function recentFailure(raw: unknown, now?: number): boolean;
export function normalizeRouterStats(
  payload: unknown,
): { totals: RouterCounters; byAccount: Record<string, RouterCounters> } | null;
export function createRouterOverviewService(options: {
  origin: string;
  headers?: Record<string, string> | (() => Record<string, string>);
  fetchJson?: (route: string) => Promise<unknown>;
  autoSupported?: boolean;
  now?: () => number;
  priority?: () => readonly string[];
  /** `accountId:model` pairs the provider recently refused. */
  blockedModels?: () => ReadonlySet<string>;
  /** Results of real test requests per account and model. */
  verification?: () => import('./dockModelVerification.mjs').VerificationStore;
}): {
  overview(period?: string, force?: boolean): Promise<RouterOverview>;
  models(force?: boolean): Promise<RouterOverview>;
  routing(force?: boolean): Promise<RouterOverview>;
};
export function patchRouterAccountSelection(source: string): string;
export function patchRouterCopilotResponses(source: string): string;
export const ROUTER_THEME_CSS: string;
export function routerPatchTargets(
  files: string[],
  read: (file: string) => string,
): { auth: string; copilot: string | null };
export function authFailure(
  usage: unknown,
  live: unknown,
  quotas?: RouterQuota[],
  raw?: unknown,
): boolean;
