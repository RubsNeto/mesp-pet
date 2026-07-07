// src/procedural/composer.ts
//
// Composição procedural do MESP. Tamanho lógico: 32x32.
//
// Anatomia geral (espaço 32x32):
//   • Corpo: squircle suave, levemente alto, com highlight de "luz vinda de
//     cima-esquerda" (1 oval mais claro no canto superior).
//   • Tufo: gota arredondada acima do corpo (mecha contínua, NÃO espinhos
//     soltos). Renderizado em grid próprio com seu próprio outline e blittado
//     em cima — assim o outline do corpo não corrompe o tufo.
//   • Olhos: DOIS olhos brancos pequenos, simétricos. As pupilas são
//     desenhadas em DOM (em <Pet/>) para seguirem o cursor — aqui só pintamos
//     a esclera + um brilhinho (specular).
//   • Boca: pequenina e sutil, presente sempre (sorriso fechado), com variantes
//     'open', 'smile', 'closed'.
//   • Bochechas (blush): 2 pixels rosa em cada lado, simétricos.
//   • Pés: 2 ovais embaixo com walking phase suave.
//   • Acessórios e manchas: cada um em camada própria, com cor que contraste
//     do corpo, para nunca sumirem na paleta gerada.

import { DEFAULT_PALETTE, MespPalette } from './palette';
import type {
  Accessory, MespTraits, SpotPattern, EyeStyle, TuftStyle, MouthStyle,
  BodyShape, BrowStyle, NeckStyle, BackStyle, HeldItem, MaterialStyle, FaceMark, OutlineMode, GradientDir,
} from './traits';
import { resolveAccessories, darken } from './traits';
import {
  Grid,
  applyOutline,
  blit,
  fillEllipse,
  fillHeart,
  fillSquircle,
  makeGrid,
  setPixel,
} from './primitives';

export const SPRITE_W = 32;
export const SPRITE_H = 32;

/**
 * Coordenadas anatômicas do MESP (espaço 32x32).
 * Usadas tanto pelo composer quanto pelo sistema de pupila DOM em <Pet/>.
 */
export const MESP_ANATOMY = {
  // Corpo
  bodyCx: 16,
  bodyCy: 18,
  bodyRx: 11,
  bodyRy: 9.5,
  bodyN: 2.4, // exponente do squircle (>2 deixa mais "redondinho-quadrado")
  // Olho ÚNICO (MESP é ciclope) — centralizado, REDONDO e bem grande.
  eyeCx: 16,
  eyeCy: 15,
  eyeRx: 4,
  eyeRy: 4,
  // Pés
  feetY: 27,
  leftFootX: 10,
  leftFootRx: 3.0,
  leftFootRy: 2.2,
  rightFootX: 22,
  rightFootRx: 3.0,
  rightFootRy: 2.2,
} as const;

export interface ComposeOptions {
  palette?: MespPalette;
  traits?: MespTraits;
  /** Variantes de olho. Aplicam-se ao olho único do MESP. */
  eye?: 'open' | 'blink' | 'closed' | 'sparkle' | 'confused';
  /** Pequeno deslocamento vertical do corpo (jump/fall/breathe). */
  bodyDy?: number;
  /** Deslocamento horizontal do corpo (sway durante caminhada). */
  bodyDx?: number;
  feet?: 'normal' | 'open' | 'jump' | 'fall' | 'sit' | 'crouch';
  /** Fase 0..1 da animação de caminhar; afeta pés e leve wobble vertical. */
  walkPhase?: number;
  /** Adiciona uma gota de suor (confused/error). */
  sweatDrop?: boolean;
}

/** Cria sombra suave (cor mais escura) usando "darken". */
function shade(c: string, amount = 0.25): string {
  const hex = c.startsWith('#') ? c.slice(1) : c;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const f = 1 - amount;
  const rr = Math.max(0, Math.min(255, Math.round(r * f)));
  const gg = Math.max(0, Math.min(255, Math.round(g * f)));
  const bb = Math.max(0, Math.min(255, Math.round(b * f)));
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

export function composeMesp(opts: ComposeOptions = {}): Grid {
  const traits = opts.traits;
  const p = traits?.palette ?? opts.palette ?? DEFAULT_PALETTE;
  const dy = opts.bodyDy ?? 0;
  const dx = opts.bodyDx ?? 0;
  const out = makeGrid(SPRITE_W, SPRITE_H);

  const accessories = traits ? resolveAccessories(traits) : [];
  const tuft = traits?.tuft ?? 'drop';
  const outlineMode: OutlineMode = traits?.outlineMode ?? 'dark';
  const outlineColor = resolveOutline(p, outlineMode);
  const applyOut = (grid: Grid) => { if (outlineMode !== 'none') applyOutline(grid, outlineColor); };

  // ---------------- Camada -1: costas (asas, capa, mochila) ---------------
  if (traits && traits.back && traits.back !== 'none') drawBack(out, p, traits.back, dx, dy);

  // ---------------- Camada 0: acessório TRASEIRO (halo, antena longa) ------
  for (const acc of accessories) drawAccessoryBack(out, p, acc, dx, dy);

  // ---------------- Camada 1: corpo + tufo --------------------------------
  const bodyGrid = makeGrid(SPRITE_W, SPRITE_H);
  drawBody(bodyGrid, p, dx, dy, {
    gradient: traits?.gradient ?? false,
    gradientDir: traits?.gradientDir ?? 'vertical',
    shape: traits?.bodyShape ?? 'squircle',
    material: traits?.material ?? 'matte',
  });
  drawTuft(bodyGrid, p, dx, dy, tuft);
  applyOut(bodyGrid);
  blit(out, bodyGrid, 0, 0);

  // ---------------- Camada 2: brilho do tufo (após outline) ---------------
  drawTuftHighlight(out, p, dx, dy, tuft);

  // ---------------- Camada 3: manchas/spots (sobre o corpo) ---------------
  if (traits && traits.spots !== 'none') {
    drawSpots(out, p, traits.spots, traits.spotColor, dx, dy);
  }

  // ---------------- Camada 3.5: pescoço (cachecol/gravata) ----------------
  if (traits && traits.neck && traits.neck !== 'none') drawNeck(out, p, traits.neck, dx, dy);

  // ---------------- Camada 4: face (olhos, boca, blush, sobrancelha) ------
  drawFace(out, p, opts, dx, dy);

  // ---------------- Camada 5: acessório FRONTAL (orelhas, lacinho, ...) ----
  for (const acc of accessories) drawAccessoryFront(out, p, acc, dx, dy);

  // ---------------- Camada 6: pés -----------------------------------------
  const feetGrid = makeGrid(SPRITE_W, SPRITE_H);
  drawFeet(feetGrid, p, opts.feet ?? 'normal', opts.walkPhase ?? 0);
  applyOut(feetGrid);
  blit(out, feetGrid, 0, 0);

  // ---------------- Camada 7: item na mão ---------------------------------
  if (traits && traits.held && traits.held !== 'none') drawHeld(out, p, traits.held, dx, dy, outlineColor);

  // ---------------- Camada 8: gota de suor opcional -----------------------
  if (opts.sweatDrop) drawSweatDrop(out, p, dx, dy);

  return out;
}

/** Resolve a cor do contorno conforme o modo. */
function resolveOutline(p: MespPalette, mode: OutlineMode): string {
  if (mode === 'family') return darken(p.bodyLo, 0.4);
  if (mode === 'white') return '#f4f8ff';
  return p.outline;
}

/** Layout dos olhos conforme a quantidade (1, 2 ou 3). */
export function eyeLayout(count: number, dx = 0, dy = 0): Array<{ cx: number; cy: number; rx: number; ry: number }> {
  const a = MESP_ANATOMY;
  if (count === 2) {
    return [
      { cx: 12 + dx, cy: a.eyeCy + dy, rx: 2.6, ry: 2.9 },
      { cx: 20 + dx, cy: a.eyeCy + dy, rx: 2.6, ry: 2.9 },
    ];
  }
  if (count === 3) {
    return [
      { cx: 11 + dx, cy: a.eyeCy - 1 + dy, rx: 2, ry: 2.2 },
      { cx: 16 + dx, cy: a.eyeCy + 2 + dy, rx: 2, ry: 2.2 },
      { cx: 21 + dx, cy: a.eyeCy - 1 + dy, rx: 2, ry: 2.2 },
    ];
  }
  return [{ cx: a.eyeCx + dx, cy: a.eyeCy + dy, rx: a.eyeRx, ry: a.eyeRy }];
}

// ===========================================================================
//  Body
// ===========================================================================

interface BodyOpts {
  gradient: boolean;
  gradientDir: GradientDir;
  shape: BodyShape;
  material: MaterialStyle;
}

function bodyDims(shape: BodyShape): { rx: number; ry: number; n: number } {
  switch (shape) {
    case 'round': return { rx: 10.5, ry: 10.5, n: 2.0 };
    case 'tall': return { rx: 9.5, ry: 11, n: 2.6 };
    case 'flat': return { rx: 12, ry: 8, n: 2.4 };
    case 'star': return { rx: 10, ry: 10, n: 2.0 };
    default: return { rx: 11, ry: 9.5, n: 2.4 };
  }
}

function insideSquircle(x: number, y: number, cx: number, cy: number, rx: number, ry: number, n: number): boolean {
  const nx = Math.abs((x - cx) / rx);
  const ny = Math.abs((y - cy) / ry);
  return Math.pow(nx, n) + Math.pow(ny, n) <= 1;
}

function toRgb(hex: string): [number, number, number] {
  const s = hex.startsWith('#') ? hex.slice(1) : hex;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/** Overlay de elipse que só pinta onde já existe corpo (evita vazar fora). */
function overlayInside(g: Grid, ecx: number, ecy: number, erx: number, ery: number, color: string): void {
  const x0 = Math.floor(ecx - erx), x1 = Math.ceil(ecx + erx);
  const y0 = Math.floor(ecy - ery), y1 = Math.ceil(ecy + ery);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const nx = (x + 0.5 - ecx) / erx;
      const ny = (y + 0.5 - ecy) / ery;
      if (nx * nx + ny * ny <= 1 && g[y]?.[x]) setPixel(g, x, y, color);
    }
  }
}

function drawBody(g: Grid, p: MespPalette, dx: number, dy: number, opts: BodyOpts): void {
  const { rx, ry, n } = bodyDims(opts.shape);
  const cx = MESP_ANATOMY.bodyCx + dx;
  const cy = MESP_ANATOMY.bodyCy + dy;

  // Sombra inferior.
  fillSquircle(g, cx, cy + 1, rx, ry, n, p.bodyLo);

  if (opts.gradient) {
    // Degradê per-pixel entre bodyHi e bodyLo ao longo da direção escolhida.
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!insideSquircle(x, y, cx, cy, rx, ry, n)) continue;
        let t: number;
        const u = (x - (cx - rx)) / (2 * rx);
        const v = (y - (cy - ry)) / (2 * ry);
        if (opts.gradientDir === 'horizontal') t = u;
        else if (opts.gradientDir === 'diagonal') t = (u + v) / 2;
        else if (opts.gradientDir === 'radial') t = Math.min(1, Math.hypot((x - cx) / rx, (y - cy) / ry));
        else t = v; // vertical
        setPixel(g, x, y, lerpColor(p.bodyHi, p.bodyLo, Math.max(0, Math.min(1, t))));
      }
    }
  } else {
    fillSquircle(g, cx, cy, rx, ry, n, p.bodyMid);
  }

  // Material.
  if (opts.material === 'metallic') {
    overlayInside(g, cx - 3, cy - 3, 5, 4, p.bodyHi);
    overlayInside(g, cx + 4, cy + 4, 4, 3, p.bodyLo);
  } else if (opts.material === 'jelly') {
    overlayInside(g, cx - 2, cy - 3, 4.5, 3.5, p.bodyHi);
    setPixel(g, cx - 4, cy - 4, p.eyeWhite);
  } else if (opts.material === 'ghost') {
    // Palidez: mistura o corpo com branco.
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cur = g[y]?.[x];
        if (cur && insideSquircle(x, y, cx, cy, rx, ry, n)) setPixel(g, x, y, lerpColor(cur, '#ffffff', 0.4));
      }
    }
  }

  // Bumps de estrela.
  if (opts.shape === 'star') {
    const pts: Array<[number, number]> = [[cx, cy - ry - 1], [cx - rx, cy - 2], [cx + rx, cy - 2], [cx - rx + 3, cy + ry - 1], [cx + rx - 3, cy + ry - 1]];
    for (const [px, py] of pts) {
      setPixel(g, px, py, p.bodyMid);
      setPixel(g, px, py + (py < cy ? -1 : 1), p.bodyMid);
    }
  }
}

// ===========================================================================
//  Tuft (mecha em cima do corpo)
// ===========================================================================

/**
 * Desenha o tufo no MESMO grid do corpo, antes do outline. Cada estilo mantem
 * um "miolo" solido para sobreviver ao applyOutline.
 */
function drawTuft(g: Grid, p: MespPalette, dx: number, dy: number, style: TuftStyle): void {
  if (style === 'bald') return;
  const a = MESP_ANATOMY;
  const cx = a.bodyCx + dx;
  const topY = Math.round(a.bodyCy + dy - a.bodyRy + 1);
  const mid = p.bodyMid;

  if (style === 'flat') {
    // Cap baixo e largo (2px de altura) sobre a testa.
    for (let x = -2; x <= 2; x += 1) setPixel(g, cx + x, topY - 1, mid);
    for (let x = -1; x <= 1; x += 1) setPixel(g, cx + x, topY - 2, mid);
    return;
  }

  if (style === 'spiky') {
    // Tres espetinhos com base conectada ao corpo.
    for (let x = -2; x <= 2; x += 1) setPixel(g, cx + x, topY - 1, mid);
    setPixel(g, cx - 2, topY - 2, mid);
    setPixel(g, cx, topY - 2, mid);
    setPixel(g, cx + 2, topY - 2, mid);
    setPixel(g, cx, topY - 3, mid);
    return;
  }

  if (style === 'fringe') {
    // Franjinha caindo sobre a testa (2 linhas largas).
    for (let x = -3; x <= 3; x += 1) setPixel(g, cx + x, topY, mid);
    for (let x = -3; x <= 3; x += 1) setPixel(g, cx + x, topY - 1, mid);
    setPixel(g, cx - 1, topY - 2, mid);
    setPixel(g, cx, topY - 2, mid);
    setPixel(g, cx + 1, topY - 2, mid);
    return;
  }

  if (style === 'swirl') {
    // Cachinho lateral (curva pra direita).
    setPixel(g, cx, topY - 1, mid);
    setPixel(g, cx, topY - 2, mid);
    setPixel(g, cx + 1, topY - 2, mid);
    setPixel(g, cx + 1, topY - 3, mid);
    setPixel(g, cx + 2, topY - 3, mid);
    setPixel(g, cx, topY - 3, mid);
    return;
  }

  // 'drop' (padrão) — forma cruz que sobrevive ao outline.
  setPixel(g, cx, topY - 4, mid);
  setPixel(g, cx - 1, topY - 3, mid);
  setPixel(g, cx,     topY - 3, mid);
  setPixel(g, cx + 1, topY - 3, mid);
  setPixel(g, cx - 1, topY - 2, mid);
  setPixel(g, cx,     topY - 2, mid);
  setPixel(g, cx + 1, topY - 2, mid);
  setPixel(g, cx, topY - 1, mid);
}

/**
 * Pinta um pequeno highlight (bodyHi) no topo do tufo após o outline.
 */
function drawTuftHighlight(g: Grid, p: MespPalette, dx: number, dy: number, style: TuftStyle): void {
  if (style === 'bald') return;
  const a = MESP_ANATOMY;
  const cx = a.bodyCx + dx;
  const topY = Math.round(a.bodyCy + dy - a.bodyRy + 1);
  if (style === 'drop') setPixel(g, cx, topY - 3, p.bodyHi);
  else if (style === 'swirl') setPixel(g, cx + 1, topY - 3, p.bodyHi);
  else if (style === 'spiky') setPixel(g, cx, topY - 3, p.bodyHi);
  else setPixel(g, cx, topY - 2, p.bodyHi);
}

// ===========================================================================
//  Face: olhos, boca, blush
// ===========================================================================

function drawFace(
  g: Grid,
  p: MespPalette,
  opts: ComposeOptions,
  dx: number,
  dy: number,
): void {
  const a = MESP_ANATOMY;
  const eye = opts.eye ?? 'open';
  const traits = opts.traits;
  const eyeStyle: EyeStyle = traits?.eyeStyle ?? 'round';
  const mouth: MouthStyle = traits?.mouth ?? 'none';
  const count = traits?.eyeCount === 2 || traits?.eyeCount === 3 ? traits.eyeCount : 1;
  const layout = eyeLayout(count, dx, dy);

  // Blush.
  if (traits?.blush) {
    drawBlush(g, traits.blushColor ?? '#ff9dbb', a.bodyCx + dx, a.eyeCy + 2 + dy);
  }

  // Marcas faciais (atrás dos olhos).
  if (traits?.marks && traits.marks !== 'none') {
    drawMarks(g, p, traits.marks, a.bodyCx + dx, a.eyeCy + dy);
  }

  // Olhos.
  if (count === 1) {
    drawEye(g, p, layout[0]!.cx, layout[0]!.cy, eye, eyeStyle);
  } else {
    for (const s of layout) drawSimpleEye(g, p, s.cx, s.cy, s.rx, s.ry, eye);
  }

  // Sobrancelhas.
  if (traits?.brows && traits.brows !== 'none') {
    for (const s of layout) drawBrow(g, p, s.cx, s.cy - Math.ceil(s.ry) - 1, traits.brows);
  }

  // Boca.
  if (mouth !== 'none') {
    drawMouth(g, p, a.bodyCx + dx, a.eyeCy + a.eyeRy + 3 + dy, mouth);
  }
}

/** Olho simples (esclera branca; pupila via DOM) para modo multi-olho. */
function drawSimpleEye(g: Grid, p: MespPalette, cx: number, cy: number, rx: number, ry: number, mode: NonNullable<ComposeOptions['eye']>): void {
  if (mode === 'blink' || mode === 'closed') {
    for (let x = -Math.round(rx); x <= Math.round(rx); x += 1) setPixel(g, cx + x, cy, p.outline);
    return;
  }
  fillEllipse(g, cx, cy, rx, ry, p.eyeWhite);
}

/** Sobrancelha acima de um olho. */
function drawBrow(g: Grid, p: MespPalette, cx: number, y: number, style: BrowStyle): void {
  const c = p.outline;
  if (style === 'flat') {
    setPixel(g, cx - 2, y, c); setPixel(g, cx - 1, y, c); setPixel(g, cx, y, c); setPixel(g, cx + 1, y, c); setPixel(g, cx + 2, y, c);
  } else if (style === 'arched') {
    setPixel(g, cx - 2, y + 1, c); setPixel(g, cx - 1, y, c); setPixel(g, cx, y - 1, c); setPixel(g, cx + 1, y, c); setPixel(g, cx + 2, y + 1, c);
  } else if (style === 'angry') {
    setPixel(g, cx - 2, y - 1, c); setPixel(g, cx - 1, y, c); setPixel(g, cx, y + 1, c); setPixel(g, cx + 1, y + 1, c); setPixel(g, cx + 2, y + 1, c);
  }
}

/** Marcas faciais (sardas, pintinhas, cicatriz, coração na bochecha). */
function drawMarks(g: Grid, p: MespPalette, style: FaceMark, cx: number, cy: number): void {
  if (style === 'freckles') {
    const c = darken(p.bodyLo, 0.1);
    setPixel(g, cx - 6, cy + 2, c); setPixel(g, cx - 5, cy + 3, c); setPixel(g, cx - 7, cy + 3, c);
    setPixel(g, cx + 6, cy + 2, c); setPixel(g, cx + 5, cy + 3, c); setPixel(g, cx + 7, cy + 3, c);
  } else if (style === 'dots') {
    const c = p.outline;
    setPixel(g, cx - 6, cy + 2, c); setPixel(g, cx + 6, cy + 2, c);
  } else if (style === 'scar') {
    const c = '#d98a8a';
    setPixel(g, cx + 5, cy - 2, c); setPixel(g, cx + 5, cy - 1, c); setPixel(g, cx + 5, cy, c);
    setPixel(g, cx + 4, cy - 1, c); setPixel(g, cx + 6, cy - 1, c);
  } else if (style === 'heartcheek') {
    fillHeart(g, cx + 6, cy + 2, 1.6, '#ff6b9a');
  }
}

/** Bochechas coradas — 2px de cada lado do olho. */
function drawBlush(g: Grid, color: string, cx: number, cy: number): void {
  setPixel(g, cx - 6, cy, color);
  setPixel(g, cx - 5, cy, color);
  setPixel(g, cx + 5, cy, color);
  setPixel(g, cx + 6, cy, color);
}

/** Boca abaixo do olho. */
function drawMouth(g: Grid, p: MespPalette, cx: number, cy: number, style: MouthStyle): void {
  const line = p.outline;
  if (style === 'smile') {
    setPixel(g, cx - 1, cy, line);
    setPixel(g, cx, cy + 1, line);
    setPixel(g, cx + 1, cy, line);
    return;
  }
  if (style === 'serious') {
    setPixel(g, cx - 1, cy, line);
    setPixel(g, cx, cy, line);
    setPixel(g, cx + 1, cy, line);
    return;
  }
  if (style === 'open') {
    fillEllipse(g, cx, cy, 1.4, 1.6, line);
    setPixel(g, cx, cy, '#c14b6a'); // interior
    return;
  }
  if (style === 'cat') {
    // Boquinha ω (:3)
    setPixel(g, cx - 1, cy, line);
    setPixel(g, cx, cy + 1, line);
    setPixel(g, cx + 1, cy, line);
    setPixel(g, cx - 2, cy - 1, line);
    setPixel(g, cx + 2, cy - 1, line);
    return;
  }
  if (style === 'tongue') {
    setPixel(g, cx - 1, cy, line);
    setPixel(g, cx, cy + 1, line);
    setPixel(g, cx + 1, cy, line);
    // linguinha
    setPixel(g, cx, cy + 2, '#ff8aa6');
    return;
  }
}

function drawEye(
  g: Grid,
  p: MespPalette,
  cx: number,
  cy: number,
  mode: NonNullable<ComposeOptions['eye']>,
  style: EyeStyle,
): void {
  const a = MESP_ANATOMY;

  if (mode === 'blink') {
    setPixel(g, cx - 3, cy - 1, p.outline);
    setPixel(g, cx - 2, cy,     p.outline);
    setPixel(g, cx - 1, cy,     p.outline);
    setPixel(g, cx,     cy,     p.outline);
    setPixel(g, cx + 1, cy,     p.outline);
    setPixel(g, cx + 2, cy,     p.outline);
    setPixel(g, cx + 3, cy - 1, p.outline);
    return;
  }

  if (mode === 'closed') {
    setPixel(g, cx - 3, cy - 1, p.outline);
    setPixel(g, cx - 2, cy,     p.outline);
    setPixel(g, cx - 1, cy + 1, p.outline);
    setPixel(g, cx,     cy + 1, p.outline);
    setPixel(g, cx + 1, cy + 1, p.outline);
    setPixel(g, cx + 2, cy,     p.outline);
    setPixel(g, cx + 3, cy - 1, p.outline);
    return;
  }

  if (mode === 'confused') {
    setPixel(g, cx - 3, cy + 1, p.outline);
    setPixel(g, cx - 2, cy,     p.outline);
    setPixel(g, cx - 1, cy - 1, p.outline);
    setPixel(g, cx,     cy - 1, p.outline);
    setPixel(g, cx + 1, cy - 1, p.outline);
    setPixel(g, cx + 2, cy,     p.outline);
    setPixel(g, cx + 3, cy + 1, p.outline);
    return;
  }

  // open / sparkle — respeita o estilo de olho escolhido.
  if (style === 'heart') {
    // Olhinhos de coração (apaixonado).
    fillHeart(g, cx, cy - 1, 3, '#ff5c8a');
    setPixel(g, cx - 1, cy - 1, '#ffd0dd'); // brilho
    return;
  }
  if (style === 'star') {
    // Olhos de estrela (empolgado).
    const yellow = '#ffd84a';
    const yellowHi = '#fff3a3';
    setPixel(g, cx, cy - 2, yellow);
    setPixel(g, cx - 1, cy - 1, yellow);
    setPixel(g, cx, cy - 1, yellowHi);
    setPixel(g, cx + 1, cy - 1, yellow);
    setPixel(g, cx - 2, cy, yellow);
    setPixel(g, cx - 1, cy, yellow);
    setPixel(g, cx, cy, yellow);
    setPixel(g, cx + 1, cy, yellow);
    setPixel(g, cx + 2, cy, yellow);
    setPixel(g, cx - 1, cy + 1, yellow);
    setPixel(g, cx + 1, cy + 1, yellow);
    setPixel(g, cx, cy + 1, yellow);
    return;
  }
  if (style === 'happy') {
    // Olho feliz fechado em arco pra cima (^).
    setPixel(g, cx - 3, cy + 1, p.outline);
    setPixel(g, cx - 2, cy,     p.outline);
    setPixel(g, cx - 1, cy - 1, p.outline);
    setPixel(g, cx,     cy - 1, p.outline);
    setPixel(g, cx + 1, cy - 1, p.outline);
    setPixel(g, cx + 2, cy,     p.outline);
    setPixel(g, cx + 3, cy + 1, p.outline);
    return;
  }
  if (style === 'sleepy') {
    // Pálpebra caída — linha superior + arco leve.
    for (let x = -3; x <= 3; x += 1) setPixel(g, cx + x, cy - 1, p.outline);
    setPixel(g, cx - 2, cy, p.outline);
    setPixel(g, cx - 1, cy, p.outline);
    setPixel(g, cx, cy, p.outline);
    setPixel(g, cx + 1, cy, p.outline);
    setPixel(g, cx + 2, cy, p.outline);
    return;
  }

  // round (padrão) / cat: esclera branca. A pupila do 'round' é DOM; a do
  // 'cat' é desenhada aqui (fenda vertical).
  fillEllipse(g, cx, cy, a.eyeRx, a.eyeRy, p.eyeWhite);
  setPixel(g, cx - 2, cy - 1, p.eyeWhite);
  if (mode === 'sparkle') {
    setPixel(g, cx + 2, cy + 1, p.eyeWhite);
  }
  if (style === 'cat') {
    // Fenda vertical (pupila de gato).
    setPixel(g, cx, cy - 2, p.outline);
    setPixel(g, cx, cy - 1, p.outline);
    setPixel(g, cx, cy,     p.outline);
    setPixel(g, cx, cy + 1, p.outline);
    setPixel(g, cx, cy + 2, p.outline);
  }
}

// ===========================================================================
//  Sweat drop (ainda usado pelo confused/error frame)
// ===========================================================================

function drawSweatDrop(g: Grid, p: MespPalette, dx: number, dy: number): void {
  const a = MESP_ANATOMY;
  // Posicionado ao lado direito do olho.
  const cx = a.eyeCx + a.eyeRx + 3 + dx;
  const cy = a.eyeCy - 2 + dy;
  setPixel(g, cx, cy,     '#9be3ff');
  setPixel(g, cx, cy + 1, '#7fd4f5');
  setPixel(g, cx, cy + 2, p.outline);
  setPixel(g, cx + 1, cy + 1, '#7fd4f5');
}

// ===========================================================================
//  Feet
// ===========================================================================

function drawFeet(
  g: Grid,
  p: MespPalette,
  mode: NonNullable<ComposeOptions['feet']>,
  walkPhase: number,
): void {
  const a = MESP_ANATOMY;
  const y = a.feetY;

  if (mode === 'jump') {
    fillEllipse(g, a.leftFootX - 1, y - 5, a.leftFootRx, a.leftFootRy, p.feetHi);
    fillEllipse(g, a.rightFootX + 1, y - 5, a.rightFootRx, a.rightFootRy, p.feetHi);
    return;
  }
  if (mode === 'fall') {
    fillEllipse(g, a.leftFootX, y + 1, a.leftFootRx + 0.5, a.leftFootRy + 0.5, p.feetHi);
    fillEllipse(g, a.rightFootX, y + 1, a.rightFootRx + 0.5, a.rightFootRy + 0.5, p.feetHi);
    return;
  }
  if (mode === 'sit') {
    fillEllipse(g, a.leftFootX + 1, y, a.leftFootRx - 0.5, a.leftFootRy, p.feetLo);
    fillEllipse(g, a.rightFootX - 1, y, a.rightFootRx - 0.5, a.rightFootRy, p.feetLo);
    return;
  }
  if (mode === 'crouch') {
    fillEllipse(g, a.leftFootX + 1, y - 1, a.leftFootRx, a.leftFootRy, p.feetHi);
    fillEllipse(g, a.rightFootX - 1, y - 1, a.rightFootRx, a.rightFootRy, p.feetHi);
    return;
  }
  if (mode === 'open') {
    fillEllipse(g, a.leftFootX - 1, y, a.leftFootRx, a.leftFootRy, p.feetHi);
    fillEllipse(g, a.rightFootX + 1, y, a.rightFootRx, a.rightFootRy, p.feetHi);
    return;
  }

  // normal — possivelmente walking
  if (walkPhase > 0) {
    const phase = walkPhase % 1;
    const sin = Math.sin(phase * Math.PI * 2);
    const leftLift = Math.max(0, sin) * 2;
    const rightLift = Math.max(0, -sin) * 2;
    const leftDx = sin * 1.5;
    const rightDx = -leftDx;
    fillEllipse(g, a.leftFootX + leftDx, y - leftLift, a.leftFootRx, a.leftFootRy, p.feetHi);
    fillEllipse(g, a.rightFootX + rightDx, y - rightLift, a.rightFootRx, a.rightFootRy, p.feetHi);
    return;
  }
  fillEllipse(g, a.leftFootX, y, a.leftFootRx, a.leftFootRy, p.feetHi);
  fillEllipse(g, a.rightFootX, y, a.rightFootRx, a.rightFootRy, p.feetHi);
}

// ===========================================================================
//  Acessórios
// ===========================================================================

/** Acessórios desenhados ANTES do corpo (camada de fundo). */
function drawAccessoryBack(
  g: Grid,
  _p: MespPalette,
  acc: Accessory,
  dx: number,
  dy: number,
): void {
  const a = MESP_ANATOMY;
  const topY = a.bodyCy + dy - a.bodyRy;

  if (acc === 'halo') {
    // Auréola dourada elíptica acima da cabeça.
    const cx = a.bodyCx + dx;
    const haloY = topY - 4;
    const goldHi = '#fff3a3';
    const goldLo = '#e3b427';
    // Anel exterior.
    for (let x = -5; x <= 5; x += 1) {
      const onTop = Math.abs(x) <= 4;
      const onBottom = Math.abs(x) <= 5 && Math.abs(x) > 1;
      if (onTop) setPixel(g, cx + x, haloY, goldHi);
      if (onBottom) setPixel(g, cx + x, haloY + 1, goldLo);
    }
  }

  if (acc === 'star') {
    // Estrelinha amarela acima.
    const cx = a.bodyCx + dx;
    const starY = topY - 5;
    const yellow = '#ffd84a';
    const yellowHi = '#fff3a3';
    setPixel(g, cx, starY, yellow);
    setPixel(g, cx - 1, starY + 1, yellow);
    setPixel(g, cx, starY + 1, yellowHi);
    setPixel(g, cx + 1, starY + 1, yellow);
    setPixel(g, cx, starY + 2, yellow);
    setPixel(g, cx - 2, starY + 1, yellow);
    setPixel(g, cx + 2, starY + 1, yellow);
  }
}

/** Acessórios desenhados DEPOIS do corpo (orelhas, lacinho, etc). */
function drawAccessoryFront(
  g: Grid,
  p: MespPalette,
  acc: Accessory,
  dx: number,
  dy: number,
): void {
  const a = MESP_ANATOMY;
  const topY = a.bodyCy + dy - a.bodyRy;

  if (acc === 'horns') {
    // Chifrinhos arredondados em cor dourada (contraste garantido).
    const goldHi = '#f4d97a';
    const goldLo = '#9d7522';
    const drawHorn = (x: number) => {
      // Base 2px + ponta 1px.
      setPixel(g, x, topY,     goldHi);
      setPixel(g, x + 1, topY, goldHi);
      setPixel(g, x, topY - 1, goldHi);
      setPixel(g, x, topY - 2, goldLo);
      setPixel(g, x + 1, topY - 1, goldLo);
    };
    drawHorn(a.bodyCx - 6 + dx);
    drawHorn(a.bodyCx + 4 + dx);
  }

  if (acc === 'ears') {
    // Orelhas redondas com interior rosa.
    const earHi = p.bodyHi;
    const earMid = p.bodyMid;
    const earLo = p.bodyLo;
    const inner = '#ffc1d4';

    const drawEar = (cx: number) => {
      // Mini-grid embutido para outline.
      const ear = makeGrid(SPRITE_W, SPRITE_H);
      fillEllipse(ear, cx, topY - 1, 2.4, 3, earMid);
      // Sombrinha embaixo.
      setPixel(ear, cx, topY + 1, earLo);
      // Interior rosa.
      fillEllipse(ear, cx, topY - 1, 1.0, 1.7, inner);
      // Top mais claro.
      setPixel(ear, cx, topY - 3, earHi);
      applyOutline(ear, p.outline);
      blit(g, ear, 0, 0);
    };
    drawEar(a.bodyCx - 7 + dx);
    drawEar(a.bodyCx + 7 + dx);
  }

  if (acc === 'antenna') {
    // Anteninha com bolinha amarela brilhante.
    const cx = a.bodyCx + dx;
    setPixel(g, cx, topY,     p.outline);
    setPixel(g, cx, topY - 1, p.outline);
    setPixel(g, cx, topY - 2, p.outline);
    fillEllipse(g, cx, topY - 4, 1.5, 1.5, '#ffd84a');
    setPixel(g, cx - 1, topY - 5, '#fff3a3'); // brilho
  }

  if (acc === 'bow') {
    // Lacinho rosa com nó central. Posicionado ao lado do tufo (canto
    // superior-direito do corpo, mas a forma fica visualmente acima).
    const cx = a.bodyCx + 4 + dx;
    const cy = topY;
    const pinkHi = '#ffb1cf';
    const pinkLo = '#cf3f6e';
    // Lóbulo esquerdo.
    setPixel(g, cx - 2, cy - 1, pinkHi);
    setPixel(g, cx - 2, cy,     pinkHi);
    setPixel(g, cx - 1, cy,     pinkHi);
    setPixel(g, cx - 2, cy + 1, pinkLo);
    // Lóbulo direito.
    setPixel(g, cx + 2, cy - 1, pinkHi);
    setPixel(g, cx + 2, cy,     pinkHi);
    setPixel(g, cx + 1, cy,     pinkHi);
    setPixel(g, cx + 2, cy + 1, pinkLo);
    // Nó central.
    setPixel(g, cx, cy, '#ffe4ee');
    setPixel(g, cx, cy + 1, pinkLo);
  }

  if (acc === 'flower') {
    // Florzinha branca com miolo amarelo no topo do corpo.
    const cx = a.bodyCx - 5 + dx;
    const cy = topY + 1;
    const petal = '#ffffff';
    const center = '#ffd84a';
    // Pétalas (norte, sul, leste, oeste, nordeste, sudoeste).
    setPixel(g, cx,     cy - 1, petal);
    setPixel(g, cx,     cy + 1, petal);
    setPixel(g, cx - 1, cy,     petal);
    setPixel(g, cx + 1, cy,     petal);
    setPixel(g, cx + 1, cy - 1, petal);
    setPixel(g, cx - 1, cy + 1, petal);
    // Miolo.
    setPixel(g, cx, cy, center);
  }

  if (acc === 'glasses' || acc === 'sunglasses') {
    // Oculos sobre o olho central (ciclope) — um aro grande.
    const a2 = MESP_ANATOMY;
    const ex = a2.eyeCx + dx;
    const ey = a2.eyeCy + dy;
    const frame = acc === 'sunglasses' ? '#20242e' : p.outline;
    // Aro (elipse vazada).
    const rim = makeGrid(SPRITE_W, SPRITE_H);
    fillEllipse(rim, ex, ey, a2.eyeRx + 1, a2.eyeRy + 1, frame);
    fillEllipse(rim, ex, ey, a2.eyeRx - 0.5, a2.eyeRy - 0.5, '__hole__');
    // Remove o miolo (marcador) e mantem so o aro.
    for (let y = 0; y < SPRITE_H; y += 1) {
      for (let x = 0; x < SPRITE_W; x += 1) {
        const c = rim[y]![x];
        if (c === '__hole__') rim[y]![x] = acc === 'sunglasses' ? '#2b3340' : null;
        else if (c === frame) setPixel(g, x, y, frame);
      }
    }
    if (acc === 'sunglasses') {
      // Lente escura preenchida + brilho.
      fillEllipse(g, ex, ey, a2.eyeRx - 0.5, a2.eyeRy - 0.5, '#2b3340');
      setPixel(g, ex - 2, ey - 1, '#5a6b82');
    }
    // Hastes laterais.
    setPixel(g, ex - a2.eyeRx - 2, ey, frame);
    setPixel(g, ex + a2.eyeRx + 2, ey, frame);
  }

  if (acc === 'cap') {
    // Bone: aba + copa em duas cores.
    const capMain = '#e5484d';
    const capHi = '#ff6b6f';
    const cx = a.bodyCx + dx;
    const y = topY;
    // Copa.
    for (let x = -4; x <= 3; x += 1) setPixel(g, cx + x, y - 1, capMain);
    for (let x = -3; x <= 2; x += 1) setPixel(g, cx + x, y - 2, capMain);
    for (let x = -2; x <= 1; x += 1) setPixel(g, cx + x, y - 3, capHi);
    // Aba pra direita.
    setPixel(g, cx + 4, y, capMain);
    setPixel(g, cx + 5, y, capMain);
    setPixel(g, cx + 6, y, capMain);
    setPixel(g, cx + 4, y + 1, capMain);
  }

  if (acc === 'tophat') {
    // Cartola preta com faixa.
    const black = '#1b1f27';
    const band = '#c14b6a';
    const cx = a.bodyCx + dx;
    const y = topY;
    // Aba larga.
    for (let x = -5; x <= 5; x += 1) setPixel(g, cx + x, y, black);
    // Copa alta.
    for (let yy = 1; yy <= 5; yy += 1) {
      for (let x = -3; x <= 3; x += 1) setPixel(g, cx + x, y - yy, black);
    }
    // Faixa.
    for (let x = -3; x <= 3; x += 1) setPixel(g, cx + x, y - 1, band);
  }

  if (acc === 'crown') {
    // Coroa dourada com pontas.
    const gold = '#ffd84a';
    const goldLo = '#e3b427';
    const cx = a.bodyCx + dx;
    const y = topY;
    for (let x = -4; x <= 4; x += 1) setPixel(g, cx + x, y, gold);
    setPixel(g, cx - 4, y - 1, gold);
    setPixel(g, cx - 4, y - 2, gold);
    setPixel(g, cx, y - 1, gold);
    setPixel(g, cx, y - 2, gold);
    setPixel(g, cx + 4, y - 1, gold);
    setPixel(g, cx + 4, y - 2, gold);
    // Joia central.
    setPixel(g, cx, y - 3, '#f04b6a');
    for (let x = -4; x <= 4; x += 1) setPixel(g, cx + x, y + 1, goldLo);
  }

  if (acc === 'headphones') {
    // Arco + duas conchas laterais.
    const band = '#2b3340';
    const cup = '#3a8fb8';
    const cx = a.bodyCx + dx;
    const y = topY;
    // Arco por cima.
    for (let x = -5; x <= 5; x += 1) {
      const yy = y - 3 - Math.round(Math.cos((x / 5) * (Math.PI / 2)) * 1);
      setPixel(g, cx + x, yy, band);
    }
    // Conchas.
    fillEllipse(g, cx - 7, a.bodyCy + dy - 1, 1.6, 2.4, cup);
    fillEllipse(g, cx + 7, a.bodyCy + dy - 1, 1.6, 2.4, cup);
  }

  if (acc === 'monocle') {
    // Monóculo no lado direito do olho.
    const ex = a.eyeCx + dx, ey = a.eyeCy + dy;
    const rim = makeGrid(SPRITE_W, SPRITE_H);
    fillEllipse(rim, ex + 1, ey, 3, 3, '#f2c14e');
    fillEllipse(rim, ex + 1, ey, 2, 2, '__hole__');
    for (let y = 0; y < SPRITE_H; y += 1) for (let x = 0; x < SPRITE_W; x += 1) {
      const c = rim[y]![x];
      if (c === '#f2c14e') setPixel(g, x, y, '#f2c14e');
    }
    // Correntinha.
    setPixel(g, ex + 4, ey + 3, '#f2c14e');
    setPixel(g, ex + 4, ey + 5, '#f2c14e');
  }

  if (acc === 'eyepatch') {
    // Tapa-olho de pirata.
    const ex = a.eyeCx + dx, ey = a.eyeCy + dy;
    fillEllipse(g, ex, ey, a.eyeRx + 0.5, a.eyeRy + 0.5, '#1b1f27');
    for (let x = -6; x <= 6; x += 1) setPixel(g, ex + x, ey - a.eyeRy - 2, '#1b1f27');
  }

  if (acc === 'glasses_square' || acc === 'glasses_heart') {
    const ex = a.eyeCx + dx, ey = a.eyeCy + dy;
    const frame = p.outline;
    if (acc === 'glasses_square') {
      for (let x = -4; x <= 4; x += 1) { setPixel(g, ex + x, ey - 3, frame); setPixel(g, ex + x, ey + 3, frame); }
      for (let y = -3; y <= 3; y += 1) { setPixel(g, ex - 4, ey + y, frame); setPixel(g, ex + 4, ey + y, frame); }
    } else {
      // Óculos coração (contorno rosa).
      const pink = '#ff5c8a';
      const ring = makeGrid(SPRITE_W, SPRITE_H);
      fillHeart(ring, ex, ey - 1, 4, pink);
      fillHeart(ring, ex, ey, 2.5, '__hole__');
      for (let y = 0; y < SPRITE_H; y += 1) for (let x = 0; x < SPRITE_W; x += 1) {
        if (ring[y]![x] === pink) setPixel(g, x, y, pink);
      }
    }
    setPixel(g, ex - 6, ey, frame);
    setPixel(g, ex + 6, ey, frame);
  }

  if (acc === 'beanie') {
    // Gorro de inverno com pompom.
    const knit = '#7a5cc9';
    const cuff = '#9b83e0';
    const cx = a.bodyCx + dx, y = topY;
    for (let yy = 0; yy <= 3; yy += 1) for (let x = -5 + yy; x <= 5 - yy; x += 1) setPixel(g, cx + x, y - yy, knit);
    for (let x = -5; x <= 5; x += 1) setPixel(g, cx + x, y + 1, cuff);
    fillEllipse(g, cx, y - 4, 1.5, 1.5, '#efe9ff'); // pompom
  }

  if (acc === 'witchhat') {
    // Chapéu pontudo de bruxa.
    const purple = '#3a2a5c';
    const band = '#7a5cc9';
    const cx = a.bodyCx + dx, y = topY;
    for (let x = -6; x <= 6; x += 1) setPixel(g, cx + x, y, purple);
    for (let yy = 1; yy <= 6; yy += 1) {
      const w = 4 - Math.floor(yy * 0.6);
      for (let x = -w; x <= w; x += 1) setPixel(g, cx + x + Math.round(yy * 0.3), y - yy, purple);
    }
    for (let x = -4; x <= 4; x += 1) setPixel(g, cx + x, y - 1, band);
  }

  if (acc === 'beret') {
    // Boina inclinada com talinho.
    const red = '#c0392b';
    const cx = a.bodyCx + dx, y = topY;
    fillEllipse(g, cx + 1, y - 1, 5, 2.4, red);
    setPixel(g, cx + 5, y - 3, '#7a1f14'); // talinho
    setPixel(g, cx - 5, y, darken(red, 0.2));
  }

  if (acc === 'chefhat') {
    // Chapéu de chef (toque blanche).
    const white = '#f4f8ff';
    const cx = a.bodyCx + dx, y = topY;
    for (let x = -4; x <= 4; x += 1) setPixel(g, cx + x, y, white);
    for (let x = -4; x <= 4; x += 1) setPixel(g, cx + x, y - 1, white);
    fillEllipse(g, cx - 3, y - 4, 2, 2, white);
    fillEllipse(g, cx, y - 5, 2.2, 2.2, white);
    fillEllipse(g, cx + 3, y - 4, 2, 2, white);
  }
}

// ===========================================================================
//  Costas / pescoço / item na mão
// ===========================================================================

/** Acessório de costas (asas, capa, mochila) — camada mais traseira. */
function drawBack(g: Grid, _p: MespPalette, style: BackStyle, dx: number, dy: number): void {
  const a = MESP_ANATOMY;
  const cx = a.bodyCx + dx;
  const cy = a.bodyCy + dy;
  if (style === 'wings') {
    const w = '#f4f8ff';
    const wLo = '#c9d3e6';
    fillEllipse(g, cx - 11, cy - 1, 3, 5, w);
    fillEllipse(g, cx + 11, cy - 1, 3, 5, w);
    fillEllipse(g, cx - 11, cy + 3, 2, 3, wLo);
    fillEllipse(g, cx + 11, cy + 3, 2, 3, wLo);
  } else if (style === 'cape') {
    const red = '#b5322b';
    for (let y = -4; y <= 9; y += 1) {
      const half = 8 + Math.round((y + 4) * 0.4);
      for (let x = -half; x <= half; x += 1) setPixel(g, cx + x, cy + y, y > 6 ? darken(red, 0.15) : red);
    }
  } else if (style === 'backpack') {
    const c = '#5a7a35';
    fillEllipse(g, cx - 10, cy + 1, 2.2, 4, c);
    fillEllipse(g, cx + 10, cy + 1, 2.2, 4, c);
  }
}

/** Acessório de pescoço (cachecol, gravata, gravata-borboleta). */
function drawNeck(g: Grid, _p: MespPalette, style: NeckStyle, dx: number, dy: number): void {
  const a = MESP_ANATOMY;
  const cx = a.bodyCx + dx;
  const y = a.bodyCy + a.bodyRy - 3 + dy;
  if (style === 'scarf') {
    const red = '#d1495b';
    for (let x = -7; x <= 7; x += 1) { setPixel(g, cx + x, y, red); setPixel(g, cx + x, y + 1, red); }
    for (let yy = 2; yy <= 5; yy += 1) { setPixel(g, cx + 3, y + yy, red); setPixel(g, cx + 4, y + yy, darken(red, 0.15)); }
  } else if (style === 'tie') {
    const blue = '#2f6fd1';
    setPixel(g, cx, y, blue); setPixel(g, cx - 1, y, blue); setPixel(g, cx + 1, y, blue);
    for (let yy = 1; yy <= 5; yy += 1) { setPixel(g, cx, y + yy, blue); if (yy > 1) { setPixel(g, cx - 1, y + yy, blue); setPixel(g, cx + 1, y + yy, blue); } }
  } else if (style === 'bowtie') {
    const c = '#7a1f9c';
    setPixel(g, cx - 2, y, c); setPixel(g, cx - 2, y + 1, c); setPixel(g, cx - 1, y, c); setPixel(g, cx - 1, y + 1, c);
    setPixel(g, cx + 2, y, c); setPixel(g, cx + 2, y + 1, c); setPixel(g, cx + 1, y, c); setPixel(g, cx + 1, y + 1, c);
    setPixel(g, cx, y, '#efe0ff');
  }
}

/** Item segurado (café, laptop, balão, pirulito) à direita do corpo. */
function drawHeld(g: Grid, _p: MespPalette, style: HeldItem, dx: number, dy: number, outline: string): void {
  const a = MESP_ANATOMY;
  const x = a.bodyCx + a.bodyRx - 1 + dx;
  const y = a.bodyCy + 4 + dy;
  if (style === 'coffee') {
    fillEllipse(g, x + 1, y, 2, 2.4, '#f4f8ff');
    setPixel(g, x + 3, y, outline); // alça
    setPixel(g, x + 1, y - 2, '#c9a06a'); // vapor/café
  } else if (style === 'laptop') {
    for (let xx = -1; xx <= 3; xx += 1) { setPixel(g, x + xx, y, '#39424f'); setPixel(g, x + xx, y - 2, '#6fcfee'); setPixel(g, x + xx, y - 1, '#6fcfee'); }
    setPixel(g, x - 1, y - 3, '#39424f'); setPixel(g, x + 3, y - 3, '#39424f');
  } else if (style === 'balloon') {
    fillEllipse(g, x + 2, y - 4, 2.4, 3, '#e5484d');
    for (let yy = -1; yy <= 3; yy += 1) setPixel(g, x + 2, y + yy, outline);
  } else if (style === 'lollipop') {
    fillEllipse(g, x + 2, y - 3, 2, 2, '#ff7ab6');
    setPixel(g, x + 2, y - 3, '#fff');
    for (let yy = -1; yy <= 3; yy += 1) setPixel(g, x + 2, y + yy, '#f4f8ff');
  }
}

// ===========================================================================
//  Spots / padrões
// ===========================================================================

function drawSpots(
  g: Grid,
  p: MespPalette,
  pattern: SpotPattern,
  color: string,
  dx: number,
  dy: number,
): void {
  const a = MESP_ANATOMY;
  const cx = a.bodyCx + dx;
  const cy = a.bodyCy + dy;

  if (pattern === 'belly') {
    // Barriga ovalada bem clara, com sombrinha.
    fillEllipse(g, cx, cy + 3, 4, 3.5, color);
    fillEllipse(g, cx, cy + 2, 3.5, 2.5, p.belly);
  }

  if (pattern === 'patches') {
    // Manchinhas em posições fixas — feitas com cor escolhida do trait.
    fillEllipse(g, cx - 5, cy - 4, 1.5, 1.2, color);
    fillEllipse(g, cx + 4, cy + 1, 2, 1.5, color);
    fillEllipse(g, cx - 2, cy + 4, 1.5, 1.2, color);
  }

  if (pattern === 'stripe') {
    // Faixa horizontal central, 2 pixels de altura.
    for (let x = cx - 8; x <= cx + 8; x += 1) {
      setPixel(g, x, cy + 4, color);
      setPixel(g, x, cy + 5, color);
    }
  }

  if (pattern === 'heart') {
    // Coraçãozinho no peito — muito fofo, especialmente em pets de cor pastel.
    fillHeart(g, cx, cy + 4, 3, color);
  }

  if (pattern === 'polka') {
    // Bolinhas espalhadas (só onde há corpo).
    const dots: Array<[number, number]> = [[-5, -3], [4, -2], [-3, 3], [3, 4], [0, -1], [-6, 1], [6, 1]];
    for (const [ox, oy] of dots) if (g[cy + oy]?.[cx + ox]) fillEllipse(g, cx + ox, cy + oy, 1, 1, color);
  }

  if (pattern === 'checker') {
    for (let y = -6; y <= 6; y += 1) {
      for (let x = -8; x <= 8; x += 1) {
        if (((x + y) & 1) === 0 && g[cy + y]?.[cx + x]) setPixel(g, cx + x, cy + y, color);
      }
    }
  }

  if (pattern === 'waves') {
    for (let x = -9; x <= 9; x += 1) {
      const yy = Math.round(Math.sin(x / 2.2) * 1.6);
      if (g[cy + yy + 2]?.[cx + x]) setPixel(g, cx + x, cy + yy + 2, color);
      if (g[cy + yy + 5]?.[cx + x]) setPixel(g, cx + x, cy + yy + 5, color);
    }
  }

  if (pattern === 'stars') {
    const stars: Array<[number, number]> = [[-5, -2], [4, 0], [-2, 4], [2, -4], [0, 2]];
    for (const [ox, oy] of stars) {
      const sx = cx + ox, sy = cy + oy;
      if (!g[sy]?.[sx]) continue;
      setPixel(g, sx, sy, color); setPixel(g, sx - 1, sy, color); setPixel(g, sx + 1, sy, color);
      setPixel(g, sx, sy - 1, color); setPixel(g, sx, sy + 1, color);
    }
  }

  if (pattern === 'camo') {
    const blobs: Array<[number, number, number]> = [[-4, -3, 2], [3, 1, 2.4], [-2, 4, 1.6], [5, -2, 1.4]];
    for (const [ox, oy, r] of blobs) overlayInside(g, cx + ox, cy + oy, r + 0.5, r, color);
  }

  if (pattern === 'circuit') {
    // Linhas + nós estilo placa de circuito.
    for (let x = -7; x <= 7; x += 1) if (g[cy]?.[cx + x]) setPixel(g, cx + x, cy, color);
    for (let y = -4; y <= 5; y += 1) if (g[cy + y]?.[cx - 3]) setPixel(g, cx - 3, cy + y, color);
    for (let y = -3; y <= 4; y += 1) if (g[cy + y]?.[cx + 4]) setPixel(g, cx + 4, cy + y, color);
    for (const [ox, oy] of [[-3, -4], [4, 4], [-3, 5], [7, 0], [-7, 0]] as Array<[number, number]>) {
      if (g[cy + oy]?.[cx + ox]) fillEllipse(g, cx + ox, cy + oy, 1, 1, color);
    }
  }
}

// ===========================================================================
//  Frames pré-compostos (com defaults — sem traits, paleta padrão).
//  São mantidos para compatibilidade. O sistema atual usa buildSpriteSet em
//  assets/sprites/index.ts pra gerar variantes por trait.
// ===========================================================================

export const FRAME_IDLE = (): Grid =>
  composeMesp({ eye: 'open', feet: 'normal' });

export const FRAME_BLINK = (): Grid =>
  composeMesp({ eye: 'blink', feet: 'normal' });

export const FRAME_SPARKLE = (): Grid =>
  composeMesp({ eye: 'sparkle', feet: 'normal' });

export const FRAME_JUMP = (): Grid =>
  composeMesp({ eye: 'sparkle', feet: 'jump', bodyDy: -1 });

export const FRAME_FALL = (): Grid =>
  composeMesp({ eye: 'open', feet: 'fall', bodyDy: 1 });

export const FRAME_CONFUSED = (): Grid =>
  composeMesp({ eye: 'confused', feet: 'crouch', sweatDrop: true });

export const FRAME_ALERT = (): Grid =>
  composeMesp({ eye: 'sparkle', feet: 'normal' });

export const FRAME_SLEEP = (): Grid =>
  composeMesp({ eye: 'closed', feet: 'sit' });

export const FRAME_SIT = (): Grid =>
  composeMesp({ eye: 'open', feet: 'sit' });

export const FRAME_CROUCH = (): Grid =>
  composeMesp({ eye: 'open', feet: 'crouch' });

/**
 * Frames de caminhada com leve wobble vertical do corpo + animação de pés.
 */
export function buildWalkingFrames(n: number, traits?: MespTraits): Grid[] {
  const out: Grid[] = [];
  for (let i = 0; i < n; i += 1) {
    const phase = i / n;
    // wobble: corpo sobe/desce 1px conforme a fase
    const sin = Math.sin(phase * Math.PI * 2);
    const bodyDy = sin > 0.5 ? -1 : 0;
    out.push(
      composeMesp({
        traits,
        eye: 'open',
        feet: 'normal',
        walkPhase: phase,
        bodyDy,
      }),
    );
  }
  return out;
}

// Re-export para uso em scripts externos (preview, testes etc.)
export { shade };
