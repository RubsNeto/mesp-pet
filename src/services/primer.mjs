// src/services/primer.mjs
//
// Monta um "primer" de contexto para injetar no agente ao conectar: notas do
// projeto + arquivos relevantes. Modulo PURO, testado em tests/primer.test.mjs.

/**
 * @param {{notes?: string, pinnedFiles?: string[]}} context
 * @returns {string} texto pronto p/ colar (vazio se nao houver contexto util).
 */
export function buildPrimer(context) {
  if (!context || typeof context !== "object") return "";
  const parts = [];
  const notes = typeof context.notes === "string" ? context.notes.trim() : "";
  if (notes) parts.push("Contexto deste projeto:\n" + notes);
  const pinned = Array.isArray(context.pinnedFiles)
    ? context.pinnedFiles.filter((f) => typeof f === "string" && f.trim())
    : [];
  if (pinned.length) {
    parts.push("Arquivos relevantes:\n" + pinned.map((f) => "- " + f).join("\n"));
  }
  return parts.join("\n\n");
}