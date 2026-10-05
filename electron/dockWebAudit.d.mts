import type { BrowserWindow } from 'electron';
import type { DeveloperCheckResult } from './dockDeveloper.mjs';
export function auditDeveloperPreview(options: {
  url: string;
  createWindow: () => BrowserWindow;
  signal: AbortSignal;
  timeout?: number;
}): Promise<DeveloperCheckResult[]>;
