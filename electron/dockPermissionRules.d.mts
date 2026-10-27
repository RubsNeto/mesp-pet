export interface PermissionRule {
  permission: string;
  patterns: string[];
  createdAt: number;
}
export interface PermissionRuleStore {
  version: 1;
  projects: Record<string, { label: string; rules: PermissionRule[] }>;
}
export function projectKey(cwd: string, platform?: NodeJS.Platform): string;
export function wildcardMatch(pattern: string, value: string): boolean;
export function normalizeRuleStore(raw: unknown): PermissionRuleStore;
export function rulesAllow(
  rules: PermissionRule[] | undefined,
  request: { permission: string; patterns: string[] },
): boolean;
export function addRule(
  store: PermissionRuleStore,
  key: string,
  label: string,
  rule: { permission: string; patterns: string[]; createdAt?: number },
): PermissionRuleStore;
export function removeRule(
  store: PermissionRuleStore,
  key: string,
  index: number,
): PermissionRuleStore;
