// src/assets/sprites/index.ts
//
// Sprites do MESP gerados proceduralmente.
// Suporta traits para variação visual por pet.

import type { PetState } from '../../types';
import {
  buildWalkingFrames,
  composeMesp,
  MESP_ANATOMY,
  SPRITE_W,
} from '../../procedural/composer';
import { renderGridToDataUrl } from '../../procedural/render';
import type { MespTraits } from '../../procedural/traits';
import { DEFAULT_TRAITS } from '../../procedural/traits';

const RENDER_SCALE = 8;

// ---------------------------------------------------------------------------
//  Per-trait sprite generation
// ---------------------------------------------------------------------------

export interface SpriteSet {
  frames: Record<PetState, string[]>;
  fps: Record<PetState, number>;
  flips: Record<string, boolean>;
  eye: Record<string, EyeConfig | null>;
}

function buildSpriteSet(traits: MespTraits): SpriteSet {
  const t = traits;
  const url = (opts: Parameters<typeof composeMesp>[0]): string =>
    renderGridToDataUrl(composeMesp({ ...opts, traits: t }), RENDER_SCALE);

  const idleBase  = url({ eye: 'open', eyePos: 'center', mouth: 'none', feet: 'normal' });
  const blink     = url({ eye: 'blink', eyePos: 'center', mouth: 'none', feet: 'normal' });
  const openMouth = url({ eye: 'open', eyePos: 'center', mouth: 'open', feet: 'normal' });
  const jump      = url({ eye: 'open', eyePos: 'center', mouth: 'smile', feet: 'jump', bodyDy: -1 });
  const fall      = url({ eye: 'open', eyePos: 'center', mouth: 'open', feet: 'fall', bodyDy: 1 });
  const confused  = url({ eye: 'confused', eyePos: 'center', mouth: 'none', feet: 'crouch' });
  const alert     = url({ eye: 'open', eyePos: 'center', mouth: 'open', feet: 'normal' });
  const sleep     = url({ eye: 'closed', eyePos: 'center', mouth: 'none', feet: 'sit' });
  const sit       = url({ eye: 'open', eyePos: 'center', mouth: 'none', feet: 'sit' });

  const walkingFrames = buildWalkingFrames(8, t).map((g) => renderGridToDataUrl(g, RENDER_SCALE));

  const frames: Record<PetState, string[]> = {
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

  const fps: Record<PetState, number> = {
    idle: 2, walking: 12, thinking: 2, working: 3,
    success: 4, error: 1, sleeping: 1, sitting: 2,
  };

  const flips: Record<string, boolean> = {};
  for (const u of walkingFrames) flips[u] = true;

  const eye: Record<string, EyeConfig | null> = {};
  const EYE_CENTER = computeEye(MESP_ANATOMY.bodyCx);
  const EYE_LEFT = computeEye(MESP_ANATOMY.eyeCx);
  eye[idleBase] = EYE_CENTER;
  eye[openMouth] = EYE_CENTER;
  eye[jump] = EYE_CENTER;
  eye[fall] = EYE_CENTER;
  eye[alert] = EYE_CENTER;
  eye[sit] = EYE_CENTER;
  eye[blink] = null;
  eye[sleep] = null;
  eye[confused] = null;
  for (const u of walkingFrames) eye[u] = EYE_LEFT;

  return { frames, fps, flips, eye };
}

// Cache sprite sets by serialized traits to avoid regenerating.
const spriteCache = new Map<string, SpriteSet>();

function traitsKey(traits: MespTraits): string {
  return `${traits.palette.bodyMid}-${traits.accessory}-${traits.spots}-${traits.spotColor}`;
}

export function getSpritesForTraits(traits: MespTraits): SpriteSet {
  const key = traitsKey(traits);
  let set = spriteCache.get(key);
  if (!set) {
    set = buildSpriteSet(traits);
    spriteCache.set(key, set);
  }
  return set;
}

// ---------------------------------------------------------------------------
//  Default sprite set (backward compat)
// ---------------------------------------------------------------------------

const defaultSet = buildSpriteSet(DEFAULT_TRAITS);

export const STATE_FRAMES = defaultSet.frames;
export const STATE_FPS = defaultSet.fps;
export const SPRITE_FLIPS_ON_RIGHT = defaultSet.flips;
export const SPRITE_EYE = defaultSet.eye;

/** @deprecated */
export const STATE_USES_PROFILE: Record<PetState, boolean> = {
  idle: false, walking: true, thinking: false, working: false,
  success: false, error: false, sleeping: false, sitting: false,
};

// ---------------------------------------------------------------------------
//  Eye config
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
const SCALE_TO_RENDER = 96 / SPRITE_W;

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
