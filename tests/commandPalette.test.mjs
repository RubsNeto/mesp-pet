// tests/commandPalette.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.resolve(__dirname, "../src/services/commandPalette.mjs")).href);
const { filterCommands, isSubsequence } = mod;

const CMDS = [
  { id: "new", label: "Novo MESP" },
  { id: "focus", label: "Modo foco", hint: "silencio" },
  { id: "reset", label: "Resetar pets" },
];

test("query vazia retorna todos", () => {
  assert.equal(filterCommands(CMDS, "").length, 3);
});

test("filtra por substring", () => {
  const r = filterCommands(CMDS, "foco");
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "focus");
});

test("filtra por subsequencia", () => {
  const r = filterCommands(CMDS, "nm");
  assert.equal(r[0].id, "new");
});

test("casa no hint tambem", () => {
  const r = filterCommands(CMDS, "silencio");
  assert.equal(r[0].id, "focus");
});

test("sem match retorna vazio", () => {
  assert.equal(filterCommands(CMDS, "zzz").length, 0);
});

test("isSubsequence basico", () => {
  assert.equal(isSubsequence("abc", "axbxc"), true);
  assert.equal(isSubsequence("abc", "acb"), false);
});

test("lista invalida retorna vazio", () => {
  assert.deepEqual(filterCommands(null, "x"), []);
});