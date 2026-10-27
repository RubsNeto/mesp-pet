export const RESERVED_MCP: Set<string>;
export function parseCommandLine(text: string): string[] | null;
export type McpEntry =
  | { type: 'local'; command: string[]; enabled: boolean }
  | { type: 'remote'; url: string; enabled: boolean };
export function mcpEntryFromForm(form: {
  name: string;
  type: 'local' | 'remote';
  command?: string;
  url?: string;
}): { name: string; entry: McpEntry; error?: undefined } | { error: string };
export interface McpServerSummary {
  name: string;
  type: 'local' | 'remote';
  target: string;
  enabled: boolean;
}
export function listMcpServers(config: Record<string, unknown>): McpServerSummary[];
export function withMcpServer<T extends Record<string, unknown>>(
  config: T,
  name: string,
  entry: unknown,
): T & { mcp: Record<string, unknown> };
export function withoutMcpServer<T extends Record<string, unknown>>(config: T, name: string): T;
export function withMcpEnabled<T extends Record<string, unknown>>(
  config: T,
  name: string,
  enabled: boolean,
): T;
export function parseSkillFile(text: string): { name: string; description: string } | null;
