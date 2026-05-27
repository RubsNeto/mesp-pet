// src/procedural/primitives.ts
//
// Primitivas de desenho 2D em grids de pixels. Cada célula é uma cor (hex)
// ou null (transparente). Operações ignoram pixels fora dos limites.

export type Pixel = string | null;
export type Grid = Pixel[][]; // grid[y][x]

export function makeGrid(w: number, h: number): Grid {
  const g: Grid = new Array(h);
  for (let y = 0; y < h; y += 1) {
    g[y] = new Array(w).fill(null);
  }
  return g;
}

export function gridSize(g: Grid): { w: number; h: number } {
  return { w: g[0]?.length ?? 0, h: g.length };
}

export function setPixel(g: Grid, x: number, y: number, c: Pixel): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (iy < 0 || iy >= g.length) return;
  const row = g[iy];
  if (ix < 0 || ix >= row.length) return;
  row[ix] = c;
}

export function getPixel(g: Grid, x: number, y: number): Pixel {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (iy < 0 || iy >= g.length) return null;
  const row = g[iy];
  if (ix < 0 || ix >= row.length) return null;
  return row[ix];
}

/** Pinta um retângulo cheio. */
export function fillRect(g: Grid, x: number, y: number, w: number, h: number, c: Pixel): void {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      setPixel(g, x + dx, y + dy, c);
    }
  }
}

/** Pinta uma elipse cheia (cx,cy = centro; rx,ry = semi-eixos). */
export function fillEllipse(g: Grid, cx: number, cy: number, rx: number, ry: number, c: Pixel): void {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      // teste do ponto centrado da célula
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) setPixel(g, x, y, c);
    }
  }
}

/** Pinta um círculo cheio. */
export function fillCircle(g: Grid, cx: number, cy: number, r: number, c: Pixel): void {
  fillEllipse(g, cx, cy, r, r, c);
}

/**
 * Pinta um "squircle" cheio (forma entre quadrado e círculo).
 * n=2 → elipse, n=4 → squircle suave, n→∞ → retângulo.
 */
export function fillSquircle(
  g: Grid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  c: Pixel
): void {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const nx = Math.abs((x + 0.5 - cx) / rx);
      const ny = Math.abs((y + 0.5 - cy) / ry);
      if (Math.pow(nx, n) + Math.pow(ny, n) <= 1) setPixel(g, x, y, c);
    }
  }
}

/**
 * Desenha um pequeno coração centrado em (cx, cy) com largura aproximada
 * `size`. Bom pra peito do pet ou enfeites. Tamanho recomendado: 4-7.
 */
export function fillHeart(g: Grid, cx: number, cy: number, size: number, c: Pixel): void {
  // Versão pixelada simples baseada em duas curvas + ponta.
  const half = Math.max(2, Math.floor(size / 2));
  // Lobos superiores.
  for (let dy = 0; dy <= half; dy += 1) {
    const radiusFactor = 1 - dy / (half + 0.5);
    const w = Math.max(0, Math.round(half * radiusFactor));
    for (let dx = -w; dx <= w; dx += 1) {
      setPixel(g, cx - half + dx, cy - 1 + dy - Math.floor(half / 2), c);
      setPixel(g, cx + half + dx, cy - 1 + dy - Math.floor(half / 2), c);
    }
  }
  // Triângulo inferior.
  for (let dy = 0; dy <= size; dy += 1) {
    const w = Math.max(0, size - dy);
    for (let dx = -w; dx <= w; dx += 1) {
      setPixel(g, cx + dx, cy + dy - Math.floor(half / 2), c);
    }
  }
}

/**
 * Aplica um contorno (cor `outline`) em todos os pixels que sejam adjacentes
 * (4-vizinhança) a pelo menos um pixel transparente. Não modifica pixels
 * que já são da cor outline. Cria um buffer, evita corrupção em loop.
 */
export function applyOutline(g: Grid, outline: string): void {
  const { w, h } = gridSize(g);
  const toPaint: Array<[number, number]> = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = g[y][x];
      if (c === null) continue;
      if (c === outline) continue;
      // checa 4-vizinhos
      const n =
        getPixel(g, x - 1, y) === null ||
        getPixel(g, x + 1, y) === null ||
        getPixel(g, x, y - 1) === null ||
        getPixel(g, x, y + 1) === null;
      if (n) toPaint.push([x, y]);
    }
  }
  for (const [x, y] of toPaint) g[y][x] = outline;
}

/**
 * Copia todas as células não-transparentes de `src` para `dst` em (dx, dy).
 * Pixels transparentes em src não sobrescrevem dst.
 */
export function blit(dst: Grid, src: Grid, dx: number, dy: number): void {
  const { w, h } = gridSize(src);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = src[y][x];
      if (c === null) continue;
      setPixel(dst, dx + x, dy + y, c);
    }
  }
}

/** Sobrescreve todas as ocorrências de `from` por `to`. */
export function replaceColor(g: Grid, from: Pixel, to: Pixel): void {
  const { w, h } = gridSize(g);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (g[y][x] === from) g[y][x] = to;
    }
  }
}

/** Espelha o grid horizontalmente (não aloca novo grid). */
export function flipH(g: Grid): void {
  const { w, h } = gridSize(g);
  for (let y = 0; y < h; y += 1) {
    const row = g[y];
    for (let x = 0; x < Math.floor(w / 2); x += 1) {
      const tmp = row[x];
      row[x] = row[w - 1 - x]!;
      row[w - 1 - x] = tmp;
    }
  }
}

/** Cria cópia profunda do grid. */
export function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.slice());
}
