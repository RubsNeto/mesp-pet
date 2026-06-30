// src/services/settingsCore.mjs
//
// Logica PURA das configuracoes do app (sem localStorage). Testada em
// tests/settingsStore.test.mjs.

/**
 * @typedef {Object} AppSettings
 * @property {{waiting:boolean,success:boolean,error:boolean,minDurationMs:number,costBudgetUsd:number,stuckAlertMin:number}} notifications
 * @property {{terminalFontSize:number,showHud:boolean,theme:string}} appearance
 * @property {{autoPrimer:boolean}} behavior
 */

/** @returns {AppSettings} */
export function defaultSettings() {
  return {
    notifications: { waiting: true, success: true, error: true, minDurationMs: 0, costBudgetUsd: 0, stuckAlertMin: 0 },
    appearance: { terminalFontSize: 11, showHud: true, theme: "dark" },
    behavior: { autoPrimer: false },
  };
}

function clamp(n, min, max, fallback) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, v));
}

/** Funde settings de fonte nao confiavel com os defaults, com clamps. */
export function normalizeSettings(obj) {
  const d = defaultSettings();
  if (!obj || typeof obj !== "object") return d;
  const n = obj.notifications && typeof obj.notifications === "object" ? obj.notifications : {};
  const a = obj.appearance && typeof obj.appearance === "object" ? obj.appearance : {};
  const b = obj.behavior && typeof obj.behavior === "object" ? obj.behavior : {};
  return {
    notifications: {
      waiting: typeof n.waiting === "boolean" ? n.waiting : d.notifications.waiting,
      success: typeof n.success === "boolean" ? n.success : d.notifications.success,
      error: typeof n.error === "boolean" ? n.error : d.notifications.error,
      minDurationMs: clamp(n.minDurationMs, 0, 3600000, d.notifications.minDurationMs),
      costBudgetUsd: clamp(n.costBudgetUsd, 0, 1000, d.notifications.costBudgetUsd),
      stuckAlertMin: clamp(n.stuckAlertMin, 0, 120, d.notifications.stuckAlertMin),
    },
    appearance: {
      terminalFontSize: Math.round(clamp(a.terminalFontSize, 8, 24, d.appearance.terminalFontSize)),
      showHud: typeof a.showHud === "boolean" ? a.showHud : d.appearance.showHud,
      theme: a.theme === "light" ? "light" : "dark",
    },
    behavior: {
      autoPrimer: typeof b.autoPrimer === "boolean" ? b.autoPrimer : d.behavior.autoPrimer,
    },
  };
}

/**
 * Decide se um evento de estado deve notificar, dada a config e a duracao.
 * @param {AppSettings} settings
 * @param {"waiting"|"success"|"error"} event
 * @param {number} [durationMs]
 * @returns {boolean}
 */
export function shouldNotify(settings, event, durationMs = 0) {
  const s = normalizeSettings(settings);
  if (!s.notifications[event]) return false;
  if (event === "waiting") return true;
  return durationMs >= s.notifications.minDurationMs;
}

/**
 * Verifica se o custo acumulado ultrapassou o orcamento configurado.
 * @param {AppSettings} settings
 * @param {number} usd
 * @returns {boolean} false se orcamento desligado (0) ou nao ultrapassado.
 */
export function budgetExceeded(settings, usd) {
  const s = normalizeSettings(settings);
  const budget = s.notifications.costBudgetUsd;
  return budget > 0 && typeof usd === "number" && usd >= budget;
}