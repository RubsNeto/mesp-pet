// src/procedural/composer.ts
//
// Composição procedural do MESP. Tamanho lógico: 32x32.
//
// Anatomia (coords no canvas 32x32):
//   corpo:    forma "squircle" (quadrado arredondado), centro (16,18), 22x22
//   tufo:     3 espinhos no canto superior direito, inclinados, MESMA COR do
//             corpo (outline final engloba tudo junto, dando aparência de
//             extensão do corpo, como cabelo)
//   olho:     oval branco grande no lado esquerdo do pet
//   pés:      2 ovais embaixo, o esquerdo mais saliente (perfil 3/4)

import { DEFAULT_PALETTE, MespPalette } from './palette';
import {
  Grid,
  applyOutline,
  fillEllipse,
  fillRect,
  fillSquircle,
  makeGrid,
  setPixel,
} from './primitives';

export const SPRITE_W = 32;
export const SPRITE_H = 32;

/** Coordenadas anatômicas do MESP (espaço 32x32). */
export const MESP_ANATOMY = {
  bodyCx: 16,
  bodyCy: 16,
  bodyRx: 11,
  bodyRy: 11,
  bodyN: 2.0,
  // Olho — arredondado.
  eyeCx: 11,
  eyeCy: 15,
  eyeRx: 3.5,
  eyeRy: 3.5,
  // Pés.
  feetY: 28,
  leftFootX: 9,
  leftFootRx: 3.5,
  leftFootRy: 2.2,
  rightFootX: 23,
  rightFootRx: 3.0,
  rightFootRy: 2.0,
  // Tufo (centralizado em bodyCx).
  tuftBaseY: 4,
} as const;

export interface ComposeOptions {
  palette?: MespPalette;
  mouth?: 'none' | 'closed' | 'open' | 'smile';
  eye?: 'open' | 'blink' | 'closed' | 'confused';
  /** Posição horizontal do olho. 'center' = encarando frente, 'left' = perfil. */
  eyePos?: 'center' | 'left';
  bodyDy?: number;
  feet?: 'normal' | 'open' | 'jump' | 'fall' | 'sit' | 'crouch';
  walkPhase?: number;
  blush?: boolean;
  eyeShift?: { dx: number; dy: number };
}

export function composeMesp(opts: ComposeOptions = {}): Grid {
  const p = opts.palette ?? DEFAULT_PALETTE;
  const g = makeGrid(SPRITE_W, SPRITE_H);
  const a = MESP_ANATOMY;
  const dy = opts.bodyDy ?? 0;

  // ----- Corpo + Tufo -----------------------------------------------------
  drawTuft(g, p, dy);
  fillSquircle(g, a.bodyCx, a.bodyCy + dy + 2, a.bodyRx, a.bodyRy, a.bodyN, p.bodyLo);
  fillSquircle(g, a.bodyCx, a.bodyCy + dy, a.bodyRx, a.bodyRy, a.bodyN, p.bodyMid);
  fillSquircle(g, a.bodyCx - 1, a.bodyCy + dy - 3, a.bodyRx - 4, a.bodyRy - 4, a.bodyN, p.bodyHi);

  // Outline do conjunto corpo+tufo (só essa parte fica delineada agora).
  applyOutline(g, p.outline);

  // ----- Olho (dentro do corpo, depois do outline) ------------------------
  // ----- Olho (dentro do corpo, depois do outline) ------------------------
  // Quando eyePos='center', deslocamos pra colocar o olho no centro horizontal
  // do corpo. Caso contrário, fica na posição lateral (perfil).
  const baseShift = opts.eyeShift ?? { dx: 0, dy: 0 };
  const centerShift = opts.eyePos === 'center'
    ? { dx: a.bodyCx - a.eyeCx + baseShift.dx, dy: baseShift.dy }
    : baseShift;
  drawEye(g, p, opts.eye ?? 'open', dy, centerShift);

  // ----- Boca -------------------------------------------------------------
  drawMouth(g, p, opts.mouth ?? 'none', dy);

  // ----- Bochecha ---------------------------------------------------------
  if (opts.blush) {
    setPixel(g, a.bodyCx + 6, a.bodyCy + dy + 1, p.blush);
    setPixel(g, a.bodyCx + 7, a.bodyCy + dy + 1, p.blush);
    setPixel(g, a.bodyCx + 6, a.bodyCy + dy + 2, p.blush);
  }

  // ----- Pés num grid SEPARADO + outline próprio --------------------------
  const feetGrid = makeGrid(SPRITE_W, SPRITE_H);
  drawFeet(feetGrid, p, opts.feet ?? 'normal', opts.walkPhase ?? 0);
  applyOutline(feetGrid, p.outline);
  // Mescla pés sobre o corpo (pixels não-transparentes do feetGrid sobrescrevem).
  for (let y = 0; y < SPRITE_H; y += 1) {
    for (let x = 0; x < SPRITE_W; x += 1) {
      const c = feetGrid[y][x];
      if (c !== null) g[y][x] = c;
    }
  }

  return g;
}

// ---------------------------------------------------------------------------
//  Sub-helpers
// ---------------------------------------------------------------------------

function drawTuft(g: Grid, p: MespPalette, dy: number): void {
  const a = MESP_ANATOMY;
  // 3 mechinhas finas posicionadas no topo do corpo, com a base "mergulhada"
  // no corpo e a ponta saindo levemente. O outline final integra tudo numa
  // silhueta única — fica como cabelinho fofo de mascote.
  const topY = a.bodyCy + dy - a.bodyRy + 1; // 1px dentro do topo do corpo
  // Cada mecha: 1 coluna de pixels indo de topY-2 (ponta) até topY+1 (raiz).
  const xs = [13, 16, 19];
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i];
    const height = i === 1 ? 3 : 2; // central mais alta
    for (let y = 0; y < height; y += 1) {
      setPixel(g, x, topY - y, p.bodyMid);
    }
    // ponta arredondada (1 pixel ligeiramente mais claro)
    setPixel(g, x, topY - height, p.bodyHi);
  }
}

/**
 * (drawTriangleSpike removida — antes era usada para os espinhos pontudos do
 * tufo. Agora drawTuft usa formato de bolinha arredondada.)
 */

function drawEye(
  g: Grid,
  p: MespPalette,
  mode: 'open' | 'blink' | 'closed' | 'confused',
  dy: number,
  shift?: { dx: number; dy: number }
): void {
  const a = MESP_ANATOMY;
  const cx = a.eyeCx + (shift?.dx ?? 0);
  const cy = a.eyeCy + dy + (shift?.dy ?? 0);

  if (mode === 'blink') {
    fillRect(g, cx - 3, cy + 1, 7, 1, p.outline);
    return;
  }
  if (mode === 'closed') {
    setPixel(g, cx - 3, cy, p.outline);
    for (let i = -2; i <= 2; i += 1) setPixel(g, cx + i, cy + 1, p.outline);
    setPixel(g, cx + 3, cy, p.outline);
    return;
  }
  if (mode === 'confused') {
    fillEllipse(g, cx, cy, a.eyeRx, a.eyeRy, p.eyeWhite);
    setPixel(g, cx - 1, cy - 1, p.outline);
    setPixel(g, cx + 1, cy + 1, p.outline);
    setPixel(g, cx + 1, cy - 1, p.outline);
    setPixel(g, cx - 1, cy + 1, p.outline);
    return;
  }
  // open: oval branco bem visível.
  fillEllipse(g, cx, cy, a.eyeRx, a.eyeRy, p.eyeWhite);
}

function drawMouth(
  g: Grid,
  p: MespPalette,
  mode: 'closed' | 'open' | 'smile' | 'none',
  dy: number
): void {
  if (mode === 'none') return;
  const cx = 18;
  const cy = 21 + dy;
  if (mode === 'closed') {
    setPixel(g, cx, cy, p.outline);
    setPixel(g, cx + 1, cy, p.outline);
    return;
  }
  if (mode === 'open') {
    fillEllipse(g, cx + 0.5, cy + 0.5, 1.3, 1.0, p.outline);
    return;
  }
  if (mode === 'smile') {
    setPixel(g, cx - 1, cy, p.outline);
    setPixel(g, cx, cy + 1, p.outline);
    setPixel(g, cx + 1, cy + 1, p.outline);
    setPixel(g, cx + 2, cy, p.outline);
  }
}

function drawFeet(
  g: Grid,
  p: MespPalette,
  mode: NonNullable<ComposeOptions['feet']>,
  walkPhase: number
): void {
  const a = MESP_ANATOMY;
  const y = a.feetY;

  if (mode === 'jump') {
    fillEllipse(g, a.leftFootX - 1, y - 6, a.leftFootRx, a.leftFootRy, p.feetHi);
    fillEllipse(g, a.rightFootX + 1, y - 6, a.rightFootRx, a.rightFootRy, p.feetHi);
    return;
  }
  if (mode === 'fall') {
    fillEllipse(g, a.leftFootX, y + 1, a.leftFootRx, a.leftFootRy + 1, p.feetHi);
    fillEllipse(g, a.rightFootX, y + 1, a.rightFootRx, a.rightFootRy + 1, p.feetHi);
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

// ---------------------------------------------------------------------------
//  Frames pré-compostos
// ---------------------------------------------------------------------------

export const FRAME_IDLE_BASE = (): Grid =>
  composeMesp({ eye: 'open', eyePos: 'center', mouth: 'none', feet: 'normal', blush: true });

export const FRAME_BLINK = (): Grid =>
  composeMesp({ eye: 'blink', eyePos: 'center', mouth: 'none', feet: 'normal', blush: true });

export const FRAME_OPEN_MOUTH = (): Grid =>
  composeMesp({ eye: 'open', eyePos: 'center', mouth: 'open', feet: 'normal', blush: true });

export const FRAME_PE_ABERTO = (): Grid =>
  composeMesp({ eye: 'open', eyePos: 'center', mouth: 'none', feet: 'open', blush: true });

export const FRAME_JUMP = (): Grid =>
  composeMesp({ eye: 'open', eyePos: 'center', mouth: 'smile', feet: 'jump', blush: true, bodyDy: -1 });

export const FRAME_FALL = (): Grid =>
  composeMesp({ eye: 'open', eyePos: 'center', mouth: 'open', feet: 'fall', bodyDy: 1, blush: true });

export const FRAME_CONFUSED = (): Grid =>
  composeMesp({ eye: 'confused', eyePos: 'center', mouth: 'none', feet: 'crouch' });

export const FRAME_ALERT = (): Grid =>
  composeMesp({ eye: 'open', eyePos: 'center', mouth: 'open', feet: 'normal', blush: true });

export const FRAME_SLEEP = (): Grid =>
  composeMesp({ eye: 'closed', eyePos: 'center', mouth: 'none', feet: 'sit', blush: true });

export const FRAME_SIT = (): Grid =>
  composeMesp({ eye: 'open', eyePos: 'center', mouth: 'none', feet: 'sit', blush: true });

export const FRAME_CROUCH = (): Grid =>
  composeMesp({ eye: 'open', eyePos: 'center', mouth: 'none', feet: 'crouch', blush: true });

export function buildWalkingFrames(n: number): Grid[] {
  const out: Grid[] = [];
  for (let i = 0; i < n; i += 1) {
    const phase = i / n;
    out.push(
      composeMesp({
        eye: 'open',
        eyePos: 'left',
        mouth: 'none',
        feet: 'normal',
        walkPhase: phase,
        blush: true,
        bodyDy: Math.abs(Math.sin(phase * Math.PI * 2)) > 0.6 ? -1 : 0,
      })
    );
  }
  return out;
}
