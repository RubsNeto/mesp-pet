import type { spawn } from 'node:child_process';
export function titlePrompt(task: string): string;
export function parseTitle(agent: string, output: string): string | null;
export function titleArgs(agent: string): string[];
export function titleCommand(
  command: string,
  args: string[],
  platform?: string,
): { command: string; args: string[] };
export interface DockTitleService {
  generate(task: string, agent?: string): Promise<string | null>;
  dispose(): void;
}
export function createDockTitleService(options: {
  directory: string;
  resolveCommand: (command: string) => string | null;
  timeoutMs?: number;
  spawnProcess?: typeof spawn;
}): DockTitleService;
