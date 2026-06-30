// src/services/runLog.mjs
//
// Reducer PURO que transforma transicoes de estado do agente numa lista de
// "execucoes" (runs) com inicio, fim, duracao, status e custo. Testado em
// tests/runLog.test.mjs. Nao guarda estado proprio: recebe a lista atual e a
// transicao, devolve a nova lista (imutavel).
//
// Estados de entrada: idle | thinking | working | waiting | success | error
// Status de run: running | success | error | done

/**
 * @typedef {import("./costParse").CostInfo} CostInfo
 * @typedef {Object} RunRecord
 * @property {string} id
 * @property {number} startedAt
 * @property {number|null} endedAt
 * @property {"running"|"success"|"error"|"done"} status
 * @property {number|null} durationMs
 * @property {CostInfo} [cost]
 */

const BUSY = new Set(["thinking", "working", "waiting"]);
const TERMINAL = { success: "success", error: "error" };

let counter = 0;
function newId() {
  counter += 1;
  return "run-" + Date.now() + "-" + counter;
}

/** Retorna a run aberta (sem endedAt), ou null. */
export function activeRun(runs) {
  if (!runs || runs.length === 0) return null;
  const last = runs[runs.length - 1];
  return last && last.endedAt == null ? last : null;
}

/**
 * Aplica uma transicao de estado a lista de runs.
 * @param {RunRecord[]} runs
 * @param {string} state
 * @param {number} [now]
 * @returns {RunRecord[]} nova lista
 */
export function applyTransition(runs, state, now = Date.now()) {
  const list = Array.isArray(runs) ? runs.slice() : [];
  const open = activeRun(list);

  if (BUSY.has(state)) {
    if (!open) {
      list.push({ id: newId(), startedAt: now, endedAt: null, status: "running", durationMs: null });
    }
    return list;
  }

  if (TERMINAL[state]) {
    if (open) {
      list[list.length - 1] = {
        ...open,
        endedAt: now,
        status: TERMINAL[state],
        durationMs: now - open.startedAt,
      };
    } else {
      list.push({ id: newId(), startedAt: now, endedAt: now, status: TERMINAL[state], durationMs: 0 });
    }
    return list;
  }

  // idle (ou qualquer outro): fecha a run aberta como "done".
  if (state === "idle" && open) {
    list[list.length - 1] = {
      ...open,
      endedAt: now,
      status: "done",
      durationMs: now - open.startedAt,
    };
  }
  return list;
}

/**
 * Anexa custo a run aberta (se houver).
 * @param {RunRecord[]} runs
 * @param {CostInfo} cost
 * @returns {RunRecord[]}
 */
export function attachCost(runs, cost) {
  const list = Array.isArray(runs) ? runs.slice() : [];
  const open = activeRun(list);
  if (open && cost) {
    list[list.length - 1] = { ...open, cost: { ...(open.cost || {}), ...cost } };
  } else if (list.length > 0 && cost) {
    const last = list[list.length - 1];
    list[list.length - 1] = { ...last, cost: { ...(last.cost || {}), ...cost } };
  }
  return list;
}

/** Mantem no maximo `max` runs (descarta as mais antigas). */
export function trimRuns(runs, max = 50) {
  if (!Array.isArray(runs)) return [];
  return runs.length > max ? runs.slice(runs.length - max) : runs;
}
/**
 * Resume uma lista de execucoes (contagens, tempo total e custo somado).
 * @param {RunRecord[]} runs
 */
export function summarizeRuns(runs) {
  const out = { total: 0, success: 0, error: 0, done: 0, running: 0, totalMs: 0, cost: {} };
  if (!Array.isArray(runs)) return out;
  for (const r of runs) {
    if (!r) continue;
    out.total += 1;
    if (out[r.status] != null) out[r.status] += 1;
    if (typeof r.durationMs === "number") out.totalMs += r.durationMs;
    if (r.cost) {
      for (const k of ["credits", "tokens", "usd", "timeSec"]) {
        if (typeof r.cost[k] === "number") out.cost[k] = (out.cost[k] || 0) + r.cost[k];
      }
    }
  }
  return out;
}