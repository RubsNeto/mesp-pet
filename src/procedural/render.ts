// src/procedural/render.ts
//
// Converte Grid (matriz de pixels) em data URL pronto pra usar em <img src=...>.
// Escala via nearest-neighbor para preservar pixel art.

import type { Grid } from './primitives';

/**
 * Renderiza um grid em data URL (PNG). O escalonamento é feito via canvas
 * ImageData diretamente (nearest-neighbor implícito), garantindo pixels
 * crocantes ao escalar.
 *
 * @param grid grid lógico (ex: 32x32)
 * @param scale fator de escala inteiro (ex: 8 → output 256x256)
 */
export function renderGridToDataUrl(grid: Grid, scale = 8): string {
  if (typeof document === 'undefined') return '';
  const lh = grid.length;
  const lw = grid[0]?.length ?? 0;
  const w = lw * scale;
  const h = lh * scale;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let ly = 0; ly < lh; ly += 1) {
    const row = grid[ly];
    for (let lx = 0; lx < lw; lx += 1) {
      const c = row[lx];
      if (c === null) continue;
      const { r, g, b, a } = parseHex(c);
      // Pinta o bloco scale x scale correspondente.
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = lx * scale + dx;
          const py = ly * scale + dy;
          const idx = (py * w + px) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

interface RGBA { r: number; g: number; b: number; a: number; }

function parseHex(hex: string): RGBA {
  let s = hex.startsWith('#') ? hex.slice(1) : hex;
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const a = s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255;
  return { r, g, b, a };
}
