// tests/contextStore.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.resolve(__dirname, "../src/services/contextCore.mjs")).href);
const { defaultProjectContext, normalizeProjectContext, defaultPrompts, normalizePrompts, contextKeyFor } = mod;

test("defaultProjectContext tem notas vazias e sem pinned", () => {
  const c = defaultProjectContext();
  assert.equal(c.notes, "");
  assert.deepEqual(c.pinnedFiles, []);
});

test("normalizeProjectContext saneia tipos errados", () => {
  const c = normalizeProjectContext({ notes: 123, pinnedFiles: ["a", 5, "", "b"] });
  assert.equal(c.notes, "");
  assert.deepEqual(c.pinnedFiles, ["a", "b"]);
});

test("normalizeProjectContext aceita objeto vazio", () => {
  const c = normalizeProjectContext(null);
  assert.deepEqual(c, defaultProjectContext());
});

test("defaultPrompts traz prompts de dev", () => {
  const p = defaultPrompts();
  assert.ok(p.length >= 3);
  assert.ok(p.every((x) => x.id && x.title && x.body));
});

test("normalizePrompts descarta invalidos e gera id", () => {
  const p = normalizePrompts([{ title: "ok", body: "b" }, { foo: 1 }, "x", { title: "", body: "" }]);
  assert.equal(p.length, 1);
  assert.ok(p[0].id.length > 0);
});

test("normalizePrompts sem array volta default", () => {
  assert.deepEqual(normalizePrompts(undefined), defaultPrompts());
});

test("contextKeyFor usa workDir ou global", () => {
  assert.equal(contextKeyFor("C:/proj"), "C:/proj");
  assert.equal(contextKeyFor(null), "__global__");
  assert.equal(contextKeyFor(""), "__global__");
});