// src/services/contextCore.mjs
//
// Logica PURA do "contexto de projeto" do MESP (sem localStorage). Testada em
// tests/contextStore.test.mjs. O wrapper contextStore.ts cuida da persistencia.
//
// Conceitos:
//   - ProjectContext: por pasta de trabalho (notas + arquivos fixados).
//   - PromptItem: prompt reutilizavel da biblioteca (global).

const MAX_NOTES = 20000;
const MAX_PINNED = 50;
const MAX_PATH = 1024;
const MAX_PROMPTS = 200;
const MAX_PROMPT_TITLE = 200;
const MAX_PROMPT_BODY = 20000;

/** @returns {{notes: string, pinnedFiles: string[]}} */
export function defaultProjectContext() {
  return { notes: "", pinnedFiles: [] };
}

/** Normaliza/saneia um objeto de contexto vindo de fonte nao confiavel. */
export function normalizeProjectContext(obj) {
  const base = defaultProjectContext();
  if (!obj || typeof obj !== "object") return base;
  const notes = typeof obj.notes === "string" ? obj.notes.slice(0, MAX_NOTES) : "";
  let pinned = Array.isArray(obj.pinnedFiles) ? obj.pinnedFiles : [];
  pinned = pinned
    .filter((p) => typeof p === "string" && p.length > 0 && p.length <= MAX_PATH)
    .slice(0, MAX_PINNED);
  return { notes, pinnedFiles: pinned };
}

let promptCounter = 0;
export function makePromptId() {
  promptCounter += 1;
  return "p-" + Date.now() + "-" + promptCounter;
}

/** Biblioteca padrao de prompts uteis para devs. */
export function defaultPrompts() {
  return [
    { id: "p-default-review", title: "Revisar codigo", body: "Revise o codigo atual em busca de bugs, casos de borda e melhorias de legibilidade. Liste por prioridade." },
    { id: "p-default-tests", title: "Escrever testes", body: "Escreva testes para o codigo que acabamos de alterar, cobrindo casos felizes e de erro." },
    { id: "p-default-explain", title: "Explicar erro", body: "Explique a causa do erro acima e proponha a correcao mais simples." },
    { id: "p-default-commit", title: "Resumir para commit/PR", body: "Resuma as mudancas desta sessao em uma mensagem de commit e uma descricao de PR." },
  ];
}

/** Normaliza/saneia uma lista de prompts vinda de fonte nao confiavel. */
export function normalizePrompts(arr) {
  if (!Array.isArray(arr)) return defaultPrompts();
  const out = [];
  for (const p of arr) {
    if (!p || typeof p !== "object") continue;
    const title = typeof p.title === "string" ? p.title.slice(0, MAX_PROMPT_TITLE) : "";
    const body = typeof p.body === "string" ? p.body.slice(0, MAX_PROMPT_BODY) : "";
    if (!title && !body) continue;
    const id = typeof p.id === "string" && p.id.length > 0 ? p.id : makePromptId();
    out.push({ id, title, body });
    if (out.length >= MAX_PROMPTS) break;
  }
  return out;
}

/** Resolve a chave de armazenamento de contexto para uma workDir (ou global). */
export function contextKeyFor(workDir) {
  return typeof workDir === "string" && workDir.length > 0 ? workDir : "__global__";
}