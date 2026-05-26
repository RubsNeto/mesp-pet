// src/services/summarize.ts
//
// Resumo automático rudimentar.
//   - Se o texto tem até 180 chars, devolve como está.
//   - Se for maior, pega as primeiras frases até caber em 180 chars.
//   - Limpa quebras de linha consecutivas.
// Esta função foi escrita para ser facilmente substituída por um modelo de IA
// no futuro. Deve sempre retornar uma string segura para exibir num balão pequeno.

const MAX = 180;

export function summarize(text: string, max: number = MAX): string {
  if (!text) return '';
  // Normaliza espaços e quebras de linha.
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;

  // Quebra em frases por pontuação simples.
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean];

  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s.trim()}` : s.trim();
    if (next.length > max) {
      if (!out) {
        // Primeira frase já passa do limite: trunca brutamente.
        return clean.slice(0, max - 1).trimEnd() + '…';
      }
      break;
    }
    out = next;
  }

  if (!out) return clean.slice(0, max - 1).trimEnd() + '…';
  return out.length < clean.length ? out + ' …' : out;
}
