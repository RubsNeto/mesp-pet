export function redactLogText(text: string, options?: { home?: string }): string;
export function formatLogLine(level: string, message: unknown, date?: Date): string;
export interface DiagnosticsInfo {
  version: string;
  channel: string;
  os: string;
  arch: string;
  electron: string;
  chrome: string;
  node: string;
  locale: string;
  runtimes: { node: string; opencode: string; router: string };
  accounts: string;
}
export function diagnosticsReport(
  info: DiagnosticsInfo,
  logTail: string[],
  options?: { home?: string },
): string;
