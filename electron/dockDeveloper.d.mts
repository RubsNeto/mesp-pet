export interface DeveloperSnapshot {
  cwd: string;
  files: Record<string, string>;
  truncated: boolean;
  bytes: number;
}
export interface DeveloperProfile {
  cwd: string;
  name: string;
  manager: { name: string; conflict: boolean; declared: boolean };
  stacks: string[];
  scripts: Record<string, string>;
  engines: Record<string, string>;
  files: string[];
  instructions: string;
  readme: string;
  warnings: string[];
  snapshot: DeveloperSnapshot;
}
export interface DeveloperCheck {
  name: string;
  script?: string;
  file?: string;
  kind: 'script' | 'node' | 'python' | 'json';
}
export interface DeveloperCheckResult {
  name: string;
  status: 'passed' | 'failed' | 'cancelled' | 'skipped';
  code: number | null;
  durationMs: number;
  output: string;
}
export interface DeveloperReport {
  version: 1;
  project: string;
  status: 'passed' | 'failed' | 'cancelled';
  repairs: number;
  files: Array<{ file: string; status: string }>;
  checks: DeveloperCheckResult[];
  skipped: Array<{ name: string; reason: string }>;
  limited: boolean;
  error?: string;
  summary?: string;
  durationMs: number;
}
export function redactDeveloperText(value: unknown): string;
export function projectSnapshot(
  cwd: string,
  options?: { maxFiles?: number; maxBytes?: number },
): Promise<DeveloperSnapshot>;
export function changedProjectFiles(
  before: DeveloperSnapshot,
  after: DeveloperSnapshot,
): DeveloperReport['files'];
export function detectProjectManager(pkg: unknown, names: string[]): DeveloperProfile['manager'];
export function discoverDeveloperChecks(profile: DeveloperProfile): {
  checks: DeveloperCheck[];
  skipped: DeveloperReport['skipped'];
};
export function inspectDeveloperProject(cwd: string): Promise<DeveloperProfile>;
export function developerBrief(profile: DeveloperProfile, memory?: unknown): string;
export function repairDeveloperPrompt(prompt: string, problems: string, attempt: number): string;
export function runDeveloperChecks(
  profile: DeveloperProfile,
  options: {
    execute: (
      check: DeveloperCheck,
      manager: string,
      timeout: number,
    ) => Promise<{ code: number | null; output: string; skipped?: boolean }>;
    signal: AbortSignal;
    deadline: number;
    onCheck?: (name: string) => void;
  },
): Promise<{
  results: DeveloperCheckResult[];
  skipped: DeveloperReport['skipped'];
  passed: boolean;
}>;
export function deliveryMarkdown(report: DeveloperReport): string;
export function createDeveloperMemory(directory: string): {
  read: (cwd: string) => Promise<unknown>;
  write: (cwd: string, report: DeveloperReport) => Promise<void>;
};
