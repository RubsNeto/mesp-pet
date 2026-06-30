// tests/primer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { buildPrimer } = await import(pathToFileURL(path.resolve(__dirname, "../src/services/primer.mjs")).href);

test("primer vazio sem contexto", () => {
  assert.equal(buildPrimer(null), "");
  assert.equal(buildPrimer({ notes: "  ", pinnedFiles: [] }), "");
});
test("primer com notas", () => {
  const p = buildPrimer({ notes: "Use TypeScript estrito." });
  assert.match(p, /Contexto deste projeto/);
  assert.match(p, /TypeScript estrito/);
});
test("primer com arquivos fixados", () => {
  const p = buildPrimer({ pinnedFiles: ["src/a.ts", "src/b.ts"] });
  assert.match(p, /Arquivos relevantes/);
  assert.match(p, /- src\/a\.ts/);
});