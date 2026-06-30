// src/services/costParse.mjs
//
// Extrai metricas de custo/uso do output das CLIs de IA. Modulo PURO, testado
// em tests/costParse.test.mjs. Cobre os formatos mais comuns:
//   - Kiro:   "Credits: 3 - Time: 2.4s"
//   - Claude: tokens de entrada/saida, "$0.0123"
//   - generico: "123 tokens", "2.4s"
// Sempre devolve um objeto possivelmente parcial; campos ausentes ficam undefined.

/**
 * @typedef {Object} CostInfo
 * @property {number} [credits]   Creditos consumidos (Kiro).
 * @property {number} [tokens]    Tokens totais.
 * @property {number} [usd]       Custo em dolares.
 * @property {number} [timeSec]   Tempo gasto em segundos.
 */

const NUM = "([0-9]+(?:[.,][0-9]+)?)";

function toNum(s) {
  if (s == null) return undefined;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Tenta extrair metricas de UMA linha (ja sem ANSI, idealmente).
 * @param {string} line
 * @returns {CostInfo | null} null se nada foi encontrado.
 */
export function parseCostLine(line) {
  if (!line || typeof line !== "string") return null;
  const text = line.trim();
  if (!text) return null;

  /** @type {CostInfo} */
  const out = {};

  const credits = text.match(new RegExp("credits?\\s*[:=]?\\s*" + NUM, "i"));
  if (credits) out.credits = toNum(credits[1]);

  const timeMs = text.match(new RegExp(NUM + "\\s*ms\\b", "i"));
  const minSec = text.match(new RegExp(NUM + "\\s*m(?:in)?\\s*" + NUM + "\\s*s\\b", "i"));
  const sec = text.match(new RegExp("(?:time|took|elapsed)?\\s*[:=]?\\s*" + NUM + "\\s*s(?:ec)?\\b", "i"));
  if (minSec) {
    out.timeSec = (toNum(minSec[1]) ?? 0) * 60 + (toNum(minSec[2]) ?? 0);
  } else if (sec) {
    out.timeSec = toNum(sec[1]);
  } else if (timeMs) {
    out.timeSec = (toNum(timeMs[1]) ?? 0) / 1000;
  }

  const inOut = text.match(new RegExp("input\\s*[:=]?\\s*" + NUM + ".*?output\\s*[:=]?\\s*" + NUM, "i"));
  const tokens = text.match(new RegExp(NUM + "\\s*tokens?\\b", "i"))
    || text.match(new RegExp("tokens?\\s*[:=]?\\s*" + NUM, "i"));
  if (inOut) {
    out.tokens = (toNum(inOut[1]) ?? 0) + (toNum(inOut[2]) ?? 0);
  } else if (tokens) {
    out.tokens = toNum(tokens[1]);
  }

  const usd = text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
  if (usd) out.usd = toNum(usd[1]);

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Funde duas metricas, preferindo o valor mais recente quando ambos existem.
 * @param {CostInfo | null | undefined} base
 * @param {CostInfo | null | undefined} next
 * @returns {CostInfo}
 */
export function mergeCost(base, next) {
  /** @type {CostInfo} */
  const out = { ...(base || {}) };
  if (next) {
    for (const k of ["credits", "tokens", "usd", "timeSec"]) {
      if (next[k] != null) out[k] = next[k];
    }
  }
  return out;
}

/**
 * Formata CostInfo numa string curta para HUD/timeline.
 * @param {CostInfo | null | undefined} cost
 * @returns {string}
 */
export function formatCost(cost) {
  if (!cost) return "";
  const parts = [];
  if (cost.timeSec != null) {
    parts.push(cost.timeSec >= 60
      ? Math.floor(cost.timeSec / 60) + "m" + String(Math.round(cost.timeSec % 60)).padStart(2, "0") + "s"
      : (Math.round(cost.timeSec * 10) / 10) + "s");
  }
  if (cost.credits != null) parts.push(cost.credits + " cr");
  if (cost.tokens != null) parts.push(cost.tokens + " tok");
  if (cost.usd != null) parts.push("$" + cost.usd.toFixed(cost.usd < 0.01 ? 4 : 2));
  return parts.join(" - ");
}
/**
 * Agrega o custo de varias execucoes (soma creditos/tokens/usd/tempo).
 * @param {Array<{cost?: CostInfo}>} runs
 * @returns {CostInfo}
 */
export function aggregateCost(runs) {
  const out = {};
  if (!Array.isArray(runs)) return out;
  for (const r of runs) {
    const c = r && r.cost;
    if (!c) continue;
    for (const k of ["credits", "tokens", "usd", "timeSec"]) {
      if (typeof c[k] === "number" && Number.isFinite(c[k])) {
        out[k] = (out[k] || 0) + c[k];
      }
    }
  }
  return out;
}