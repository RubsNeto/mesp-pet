// src/services/commandPalette.mjs
//
// Logica PURA do command palette (filtragem). Testada em
// tests/commandPalette.test.mjs.

/**
 * @typedef {Object} PaletteCommand
 * @property {string} id
 * @property {string} label
 * @property {string} [hint]
 * @property {boolean} [disabled]
 */

/**
 * Filtra comandos por uma query (case-insensitive). Faz match por subsequencia
 * no label+hint (ex: "nm" casa "Novo MESP"). Mantem a ordem original.
 * @param {PaletteCommand[]} commands
 * @param {string} query
 * @returns {PaletteCommand[]}
 */
export function filterCommands(commands, query) {
  if (!Array.isArray(commands)) return [];
  const q = String(query || "").trim().toLowerCase();
  if (!q) return commands.slice();
  return commands.filter((c) => {
    const hay = ((c.label || "") + " " + (c.hint || "")).toLowerCase();
    return isSubsequence(q, hay);
  });
}

/** true se `needle` aparece como subsequencia de `hay`. */
export function isSubsequence(needle, hay) {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j += 1) {
    if (hay[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}