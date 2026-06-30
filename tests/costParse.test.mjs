// tests/costParse.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.resolve(__dirname, "../src/services/costParse.mjs")).href);
const { parseCostLine, mergeCost, formatCost } = mod;

test("Kiro: Credits + Time", () => {
  const c = parseCostLine("Credits: 3 - Time: 2.4s");
  assert.equal(c.credits, 3);
  assert.equal(c.timeSec, 2.4);
});

test("tempo em minutos e segundos", () => {
  const c = parseCostLine("Time: 1m 03s");
  assert.equal(c.timeSec, 63);
});

test("tempo em ms", () => {
  const c = parseCostLine("took 450ms");
  assert.equal(c.timeSec, 0.45);
});

test("tokens input/output somados", () => {
  const c = parseCostLine("input: 100 output: 50");
  assert.equal(c.tokens, 150);
});

test("tokens simples", () => {
  const c = parseCostLine("used 1234 tokens");
  assert.equal(c.tokens, 1234);
});

test("custo em USD", () => {
  const c = parseCostLine("cost: $0.0123");
  assert.equal(c.usd, 0.0123);
});

test("linha sem metrica retorna null", () => {
  assert.equal(parseCostLine("apenas um log"), null);
  assert.equal(parseCostLine(""), null);
});

test("mergeCost prefere o mais recente", () => {
  const m = mergeCost({ credits: 1, tokens: 10 }, { credits: 2 });
  assert.equal(m.credits, 2);
  assert.equal(m.tokens, 10);
});

test("formatCost monta string curta", () => {
  assert.equal(formatCost({ timeSec: 2.4, credits: 3 }), "2.4s - 3 cr");
  assert.equal(formatCost({ timeSec: 63 }), "1m03s");
  assert.equal(formatCost(null), "");
});
import { test as test2 } from "node:test";
import assert2 from "node:assert/strict";
import { aggregateCost } from "../src/services/costParse.mjs";

test2("aggregateCost soma custos de varias runs", () => {
  const runs = [
    { cost: { credits: 2, usd: 0.01, timeSec: 1.5 } },
    { cost: { credits: 3, usd: 0.02 } },
    {},
    { cost: { tokens: 100 } },
  ];
  const a = aggregateCost(runs);
  assert2.equal(a.credits, 5);
  assert2.equal(a.tokens, 100);
  assert2.equal(Math.round(a.usd * 100) / 100, 0.03);
  assert2.equal(a.timeSec, 1.5);
});

test2("aggregateCost com lista vazia volta objeto vazio", () => {
  assert2.deepEqual(aggregateCost([]), {});
  assert2.deepEqual(aggregateCost(null), {});
});