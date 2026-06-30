// tests/settingsStore.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.resolve(__dirname, "../src/services/settingsCore.mjs")).href);
const { defaultSettings, normalizeSettings, shouldNotify } = mod;

test("defaultSettings tem estrutura esperada", () => {
  const s = defaultSettings();
  assert.equal(s.notifications.waiting, true);
  assert.equal(s.appearance.terminalFontSize, 11);
});

test("normalizeSettings faz clamp da fonte", () => {
  assert.equal(normalizeSettings({ appearance: { terminalFontSize: 100 } }).appearance.terminalFontSize, 24);
  assert.equal(normalizeSettings({ appearance: { terminalFontSize: 2 } }).appearance.terminalFontSize, 8);
});

test("normalizeSettings clampa minDurationMs", () => {
  assert.equal(normalizeSettings({ notifications: { minDurationMs: -5 } }).notifications.minDurationMs, 0);
});

test("normalizeSettings aceita lixo", () => {
  assert.deepEqual(normalizeSettings(null), defaultSettings());
});

test("shouldNotify respeita toggles", () => {
  const s = defaultSettings();
  s.notifications.success = false;
  assert.equal(shouldNotify(s, "success", 10000), false);
  assert.equal(shouldNotify(s, "error", 10000), true);
});

test("shouldNotify aplica limiar de duracao em success/error", () => {
  const s = defaultSettings();
  s.notifications.minDurationMs = 5000;
  assert.equal(shouldNotify(s, "success", 1000), false);
  assert.equal(shouldNotify(s, "success", 6000), true);
});

test("shouldNotify: waiting ignora limiar", () => {
  const s = defaultSettings();
  s.notifications.minDurationMs = 999999;
  assert.equal(shouldNotify(s, "waiting", 0), true);
});
import { test as testB } from "node:test";
import assert2 from "node:assert/strict";
import { budgetExceeded } from "../src/services/settingsCore.mjs";

testB("budgetExceeded desligado quando budget=0", () => {
  const s = normalizeSettings({ notifications: { costBudgetUsd: 0 } });
  assert2.equal(budgetExceeded(s, 999), false);
});
testB("budgetExceeded dispara ao atingir o limite", () => {
  const s = normalizeSettings({ notifications: { costBudgetUsd: 0.5 } });
  assert2.equal(budgetExceeded(s, 0.4), false);
  assert2.equal(budgetExceeded(s, 0.5), true);
  assert2.equal(budgetExceeded(s, 0.9), true);
});
testB("normalizeSettings traz novos campos com defaults", () => {
  const s = normalizeSettings(null);
  assert2.equal(s.notifications.costBudgetUsd, 0);
  assert2.equal(s.notifications.stuckAlertMin, 0);
  assert2.equal(s.appearance.theme, "dark");
  assert2.equal(s.behavior.autoPrimer, false);
});
testB("theme so aceita light/dark", () => {
  assert2.equal(normalizeSettings({ appearance: { theme: "xpto" } }).appearance.theme, "dark");
  assert2.equal(normalizeSettings({ appearance: { theme: "light" } }).appearance.theme, "light");
});