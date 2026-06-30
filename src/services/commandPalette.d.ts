// src/services/commandPalette.d.ts
export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}
export function filterCommands<T extends { label: string; hint?: string }>(commands: T[], query: string): T[];
export function isSubsequence(needle: string, hay: string): boolean;