// tests/runLog.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.resolve(__dirname, "../src/services/runLog.mjs")).href);
const { applyTransition, activeRun, attachCost, trimRuns } = mod;

test("inicia run ao entrar em thinking", () => {
  const r = applyTransition([], "thinking", 1000);
  assert.equal(r.length, 1);
  assert.equal(r[0].status, "running");
  assert.equal(r[0].startedAt, 1000);
  assert.equal(r[0].endedAt, null);
});

test("nao abre nova run se ja ha uma aberta (working apos thinking)", () => {
  let r = applyTransition([], "thinking", 1000);
  r = applyTransition(r, "working", 1200);
  assert.equal(r.length, 1);
});

test("waiting mantem a run aberta", () => {
  let r = applyTransition([], "working", 1000);
  r = applyTransition(r, "waiting", 1500);
  assert.equal(r.length, 1);
  assert.equal(activeRun(r).status, "running");
});

test("success fecha a run com duracao", () => {
  let r = applyTransition([], "thinking", 1000);
  r = applyTransition(r, "success", 3000);
  assert.equal(r[0].status, "success");
  assert.equal(r[0].endedAt, 3000);
  assert.equal(r[0].durationMs, 2000);
  assert.equal(activeRun(r), null);
});

test("error fecha a run", () => {
  let r = applyTransition([], "working", 1000);
  r = applyTransition(r, "error", 1800);
  assert.equal(r[0].status, "error");
  assert.equal(r[0].durationMs, 800);
});

test("idle fecha run aberta como done", () => {
  let r = applyTransition([], "thinking", 1000);
  r = applyTransition(r, "idle", 2000);
  assert.equal(r[0].status, "done");
  assert.equal(r[0].durationMs, 1000);
});

test("idle sem run aberta nao cria nada", () => {
  const r = applyTransition([], "idle", 1000);
  assert.equal(r.length, 0);
});

test("ciclo completo gera 2 runs", () => {
  let r = [];
  r = applyTransition(r, "thinking", 1000);
  r = applyTransition(r, "success", 2000);
  r = applyTransition(r, "thinking", 5000);
  r = applyTransition(r, "error", 6000);
  assert.equal(r.length, 2);
  assert.equal(r[0].status, "success");
  assert.equal(r[1].status, "error");
});

test("attachCost adiciona custo a run aberta", () => {
  let r = applyTransition([], "working", 1000);
  r = attachCost(r, { credits: 2 });
  assert.equal(activeRun(r).cost.credits, 2);
});

test("trimRuns mantem no maximo max", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ id: "r" + i, startedAt: i, endedAt: i, status: "done", durationMs: 0 }));
  const t = trimRuns(many, 50);
  assert.equal(t.length, 50);
  assert.equal(t[0].id, "r10");
});
import { test as testS } from "node:test";
import assert3 from "node:assert/strict";
import { summarizeRuns } from "../src/services/runLog.mjs";

testS("summarizeRuns conta status e soma tempo/custo", () => {
  const runs = [
    { id: "a", status: "success", durationMs: 1000, cost: { usd: 0.01 } },
    { id: "b", status: "error", durationMs: 500 },
    { id: "c", status: "done", durationMs: 200, cost: { usd: 0.02, tokens: 50 } },
  ];
  const s = summarizeRuns(runs);
  assert3.equal(s.total, 3);
  assert3.equal(s.success, 1);
  assert3.equal(s.error, 1);
  assert3.equal(s.totalMs, 1700);
  assert3.equal(Math.round(s.cost.usd * 100) / 100, 0.03);
  assert3.equal(s.cost.tokens, 50);
});