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
import type { Accessory, MespTraits, SpotPattern } from './traits';
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

  // ---------------- Camada 0: acessório TRASEIRO (halo, antena longa) ------
  if (traits) drawAccessoryBack(out, p, traits.accessory, dx, dy);

  // ---------------- Camada 1: corpo + tufo (em grid próprio com outline) ---
  // O tufo é desenhado JUNTO com o corpo no mesmo grid e ANTES do outline,
  // para que os pixels internos (que têm 4 vizinhos preenchidos) sobrevivam.
  // Se tentássemos outline separado, o tufo fino vira tudo outline preto.
  const bodyGrid = makeGrid(SPRITE_W, SPRITE_H);
  drawBody(bodyGrid, p, dx, dy);
  drawTuft(bodyGrid, p, dx, dy);
  applyOutline(bodyGrid, p.outline);
  blit(out, bodyGrid, 0, 0);

  // ---------------- Camada 2: brilho do tufo (após outline) ---------------
  // Pintamos o pixel mais alto do tufo com bodyHi por cima do outline para
  // dar um "brilhinho" no topo da mecha — fica fofo.
  drawTuftHighlight(out, p, dx, dy);

  // ---------------- Camada 3: manchas/spots (sobre o corpo) ---------------
  if (traits && traits.spots !== 'none') {
    drawSpots(out, p, traits.spots, traits.spotColor, dx, dy);
  }

  // ---------------- Camada 4: face (olhos, boca, blush) -------------------
  drawFace(out, p, opts, dx, dy);

  // ---------------- Camada 5: acessório FRONTAL (orelhas, lacinho, ...) ----
  if (traits) drawAccessoryFront(out, p, traits.accessory, dx, dy);

  // ---------------- Camada 6: pés (grid próprio com outline isolado) ------
  const feetGrid = makeGrid(SPRITE_W, SPRITE_H);
  drawFeet(feetGrid, p, opts.feet ?? 'normal', opts.walkPhase ?? 0);
  applyOutline(feetGrid, p.outline);
  blit(out, feetGrid, 0, 0);

  // ---------------- Camada 7: gota de suor opcional -----------------------
  if (opts.sweatDrop) drawSweatDrop(out, p, dx, dy);

  return out;
}

// ===========================================================================
//  Body
// ===========================================================================

function drawBody(g: Grid, p: MespPalette, dx: number, dy: number): void {
  const a = MESP_ANATOMY;
  const cx = a.bodyCx + dx;
  const cy = a.bodyCy + dy;

  // Sombra inferior (1px abaixo, cor mais escura — dá só um senso de "peso").
  fillSquircle(g, cx, cy + 1, a.bodyRx, a.bodyRy, a.bodyN, p.bodyLo);
  // Corpo principal — cor uniforme, sem highlight para um visual limpo.
  fillSquircle(g, cx, cy, a.bodyRx, a.bodyRy, a.bodyN, p.bodyMid);
}

// ===========================================================================
//  Tuft (mecha em cima do corpo)
// ===========================================================================

/**
 * Desenha o tufo no MESMO grid do corpo, antes do outline.
 * Forma de gota arredondada com 2 linhas de "miolo" — pixels internos sobrevivem
 * ao applyOutline e dão a cor do corpo, criando um cabelinho integrado.
 */
function drawTuft(g: Grid, p: MespPalette, dx: number, dy: number): void {
  const a = MESP_ANATOMY;
  const cx = a.bodyCx + dx;
  // Topo do corpo (em y absolutos). bodyCy=18, bodyRy=9.5 → topo perto de y=9.
  const topY = Math.round(a.bodyCy + dy - a.bodyRy + 1);

  // Forma cruz (3+3+3 + ponta) — garante que (cx, topY-2) e (cx, topY-3)
  // tenham 4 vizinhos preenchidos e sobrevivam ao applyOutline.
  //
  //         topY-4: . X .
  //         topY-3: X X X
  //         topY-2: X X X
  //         topY-1: . X .
  //         topY  : (corpo)

  const mid = p.bodyMid;
  // Linha topY-4 (ponta).
  setPixel(g, cx, topY - 4, mid);
  // Linha topY-3.
  setPixel(g, cx - 1, topY - 3, mid);
  setPixel(g, cx,     topY - 3, mid);
  setPixel(g, cx + 1, topY - 3, mid);
  // Linha topY-2.
  setPixel(g, cx - 1, topY - 2, mid);
  setPixel(g, cx,     topY - 2, mid);
  setPixel(g, cx + 1, topY - 2, mid);
  // Linha topY-1 (ombro, se conecta com o corpo).
  setPixel(g, cx, topY - 1, mid);
}

/**
 * Pinta um pequeno highlight (bodyHi) no centro do tufo após o outline,
 * só pra dar volume. Sobrescreve 1 pixel.
 */
function drawTuftHighlight(g: Grid, p: MespPalette, dx: number, dy: number): void {
  const a = MESP_ANATOMY;
  const cx = a.bodyCx + dx;
  const topY = Math.round(a.bodyCy + dy - a.bodyRy + 1);
  setPixel(g, cx, topY - 3, p.bodyHi);
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

  // MESP é ciclope — UM olho central, grande e expressivo.
  // Sem boca, sem blush — visual minimalista (só olho).
  drawEye(g, p, a.eyeCx + dx, a.eyeCy + dy, eye);
}

function drawEye(
  g: Grid,
  p: MespPalette,
  cx: number,
  cy: number,
  mode: NonNullable<ComposeOptions['eye']>,
): void {
  const a = MESP_ANATOMY;

  if (mode === 'blink') {
    // Linha praticamente reta (com cantos elevados) — 7px wide.
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
    // Olho fechado em arco para baixo (⌣) — 7px wide.
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
    // Sobrancelhas em V invertido (⌒) — 7px wide.
    setPixel(g, cx - 3, cy + 1, p.outline);
    setPixel(g, cx - 2, cy,     p.outline);
    setPixel(g, cx - 1, cy - 1, p.outline);
    setPixel(g, cx,     cy - 1, p.outline);
    setPixel(g, cx + 1, cy - 1, p.outline);
    setPixel(g, cx + 2, cy,     p.outline);
    setPixel(g, cx + 3, cy + 1, p.outline);
    return;
  }

  // open / sparkle: oval branco grande + brilhinho.
  fillEllipse(g, cx, cy, a.eyeRx, a.eyeRy, p.eyeWhite);
  // Brilho principal no canto superior-esquerdo (specular highlight).
  setPixel(g, cx - 2, cy - 1, p.eyeWhite);
  if (mode === 'sparkle') {
    // Estrelinha extra no canto inferior-direito (pisca-vida).
    setPixel(g, cx + 2, cy + 1, p.eyeWhite);
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
