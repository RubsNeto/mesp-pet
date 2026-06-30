// src/services/settingsCore.d.ts
export interface AppSettings {
  notifications: {
    waiting: boolean;
    success: boolean;
    error: boolean;
    minDurationMs: number;
    costBudgetUsd: number;
    stuckAlertMin: number;
  };
  appearance: { terminalFontSize: number; showHud: boolean; theme: "dark" | "light" };
  behavior: { autoPrimer: boolean };
}
export function defaultSettings(): AppSettings;
export function normalizeSettings(obj: unknown): AppSettings;
export function shouldNotify(settings: AppSettings, event: "waiting" | "success" | "error", durationMs?: number): boolean;
export function budgetExceeded(settings: AppSettings, usd: number): boolean;