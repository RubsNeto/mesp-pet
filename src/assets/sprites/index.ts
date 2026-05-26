// src/assets/sprites/index.ts
//
// Sprites do MESP gerados 100% PROCEDURALMENTE em código.
// Nenhum PNG é importado ou extraído — o pet é desenhado em runtime via
// primitivas (elipses, retângulos, outline).
//
// Para mudar o visual:
//   - Cores: src/procedural/palette.ts
//   - Forma: src/procedural/composer.ts (MESP_ANATOMY + sub-helpers)
//   - Animações: STATE_FRAMES abaixo

import type { PetState } from '../../types';
import {
  buildWalkingFrames,
  FRAME_ALERT,
  FRAME_BLINK,
  FRAME_CONFUSED,
  FRAME_FALL,
  FRAME_IDLE_BASE,
  FRAME_JUMP,
  FRAME_OPEN_MOUTH,
  FRAME_SIT,
  FRAME_SLEEP,
  MESP_ANATOMY,
  SPRITE_W,
} from '../../procedural/composer';
import { renderGridToDataUrl } from '../../procedural/render';

const RENDER_SCALE = 8; // 32 lógico × 8 = 256px no data URL

const url = (build: () => ReturnType<typeof FRAME_IDLE_BASE>): string =>
  renderGridToDataUrl(build(), RENDER_SCALE);

// ---------------------------------------------------------------------------
//  URLs por sprite
// ---------------------------------------------------------------------------

const idleBase  = url(FRAME_IDLE_BASE);
const blink     = url(FRAME_BLINK);
const openMouth = url(FRAME_OPEN_MOUTH);
const jump      = url(FRAME_JUMP);
const fall      = url(FRAME_FALL);
const confused  = url(FRAME_CONFUSED);
const alert     = url(FRAME_ALERT);
const sleep     = url(FRAME_SLEEP);
const sit       = url(FRAME_SIT);

// 8 frames de walking em loop.
const walkingFrames = buildWalkingFrames(8).map((g) => renderGridToDataUrl(g, RENDER_SCALE));

// ---------------------------------------------------------------------------
//  STATE_FRAMES
// ---------------------------------------------------------------------------

export const STATE_FRAMES: Record<PetState, string[]> = {
  idle: [
    idleBase, idleBase, idleBase, idleBase, idleBase, idleBase, idleBase, idleBase,
    idleBase, idleBase, blink, idleBase, idleBase, idleBase, idleBase, idleBase,
  ],
  walking: walkingFrames,
  thinking: [confused, idleBase, confused, idleBase],
  working: [alert, idleBase, alert, idleBase],
  success: [jump, fall, jump, fall],
  error: [confused],
  sleeping: [sleep],
  sitting: [sit],
};

export const STATE_FPS: Record<PetState, number> = {
  idle: 2,
  walking: 12,
  thinking: 2,
  working: 3,
  success: 4,
  error: 1,
  sleeping: 1,
  sitting: 2,
};

// ---------------------------------------------------------------------------
//  SPRITE_FLIPS_ON_RIGHT
// ---------------------------------------------------------------------------

/** Walking flipa quando o pet anda pra direita (perfil esquerdo é o canônico). */
export const SPRITE_FLIPS_ON_RIGHT: Record<string, boolean> = {};
for (const u of walkingFrames) SPRITE_FLIPS_ON_RIGHT[u] = true;

/** @deprecated mantido pra compat. */
export const STATE_USES_PROFILE: Record<PetState, boolean> = {
  idle: false,
  walking: true,
  thinking: false,
  working: false,
  success: false,
  error: false,
  sleeping: false,
  sitting: false,
};

// Não-usado externamente, mas evita warnings:
void openMouth;

// ---------------------------------------------------------------------------
//  SPRITE_EYE — coordenadas calculadas matematicamente
// ---------------------------------------------------------------------------

export interface EyeConfig {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  size: number;
}

const PUPIL_DIAMETER = 5;
const SAFETY_MARGIN = 3;
const SCALE_TO_RENDER = 96 / SPRITE_W; // pet renderiza em 96x96 no display

function computeEye(absoluteCx?: number): EyeConfig {
  const a = MESP_ANATOMY;
  const sourceCx = absoluteCx ?? a.eyeCx;
  const cx = sourceCx * SCALE_TO_RENDER;
  const cy = a.eyeCy * SCALE_TO_RENDER;
  const rxPx = a.eyeRx * SCALE_TO_RENDER;
  const ryPx = a.eyeRy * SCALE_TO_RENDER;
  return {
    cx: round1(cx),
    cy: round1(cy),
    rx: Math.max(0, round1(rxPx - PUPIL_DIAMETER / 2 - SAFETY_MARGIN)),
    ry: Math.max(0, round1(ryPx - PUPIL_DIAMETER / 2 - SAFETY_MARGIN)),
    size: PUPIL_DIAMETER,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const EYE_CENTER = computeEye(MESP_ANATOMY.bodyCx); // idle/parado
const EYE_LEFT   = computeEye(MESP_ANATOMY.eyeCx);  // walking (perfil)

export const SPRITE_EYE: Record<string, EyeConfig | null> = {
  [idleBase]:  EYE_CENTER,
  [openMouth]: EYE_CENTER,
  [jump]:      EYE_CENTER,
  [fall]:      EYE_CENTER,
  [alert]:     EYE_CENTER,
  [sit]:       EYE_CENTER,
  // Olhos fechados / sem pupila
  [blink]:    null,
  [sleep]:    null,
  [confused]: null,
};
for (const u of walkingFrames) SPRITE_EYE[u] = EYE_LEFT;
