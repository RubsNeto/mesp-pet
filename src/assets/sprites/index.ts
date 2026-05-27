// src/assets/sprites/index.ts
//
// Sprites do MESP gerados proceduralmente.
// Suporta traits para variação visual por pet e múltiplos olhos por frame
// (pupila DOM em cima de cada esclera renderizada).

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
//  Eye configuration (pupil DOM positioning)
// ---------------------------------------------------------------------------

/** Posição/tamanho de UMA esclera no espaço renderizado (96px). */
export interface EyeSlot {
  /** Centro horizontal em pixels do sprite renderizado. */
  cx: number;
  /** Centro vertical. */
  cy: number;
  /** Raio horizontal disponível para movimento da pupila. */
  rx: number;
  /** Raio vertical. */
  ry: number;
}

/** Config de pupilas para um frame. */
export interface EyeConfig {
  /** Diâmetro da pupila (pixels do DOM, escala renderizada). */
  size: number;
  /** Slots — uma por pupila. */
  slots: EyeSlot[];
}

const PUPIL_DIAMETER = 8;
const SAFETY_MARGIN = 2;
const SCALE_TO_RENDER = 96 / SPRITE_W;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Cria uma EyeConfig para olhos posicionados em cx logical (1..32). */
function makeEyeConfig(slotsLogical: Array<{ cx: number; cy: number }>): EyeConfig {
  const a = MESP_ANATOMY;
  const rxPx = a.eyeRx * SCALE_TO_RENDER;
  const ryPx = a.eyeRy * SCALE_TO_RENDER;
  const usableRx = Math.max(0, rxPx - PUPIL_DIAMETER / 2 - SAFETY_MARGIN);
  const usableRy = Math.max(0, ryPx - PUPIL_DIAMETER / 2 - SAFETY_MARGIN);
  const slots = slotsLogical.map((s) => ({
    cx: round1(s.cx * SCALE_TO_RENDER),
    cy: round1(s.cy * SCALE_TO_RENDER),
    rx: round1(usableRx),
    ry: round1(usableRy),
  }));
  return { size: PUPIL_DIAMETER, slots };
}

// MESP é ciclope — 1 olho central.
const DEFAULT_EYE_CONFIG: EyeConfig = makeEyeConfig([
  { cx: MESP_ANATOMY.eyeCx, cy: MESP_ANATOMY.eyeCy },
]);

// ---------------------------------------------------------------------------
//  Per-trait sprite generation
// ---------------------------------------------------------------------------

export interface SpriteSet {
  frames: Record<PetState, string[]>;
  fps: Record<PetState, number>;
  /** Quais data URLs devem ser flipadas quando o pet anda para a direita. */
  flips: Record<string, boolean>;
  /** Config de pupila por data URL (null = sem pupila DOM). */
  eye: Record<string, EyeConfig | null>;
}

function buildSpriteSet(traits: MespTraits): SpriteSet {
  const t = traits;
  const url = (opts: Parameters<typeof composeMesp>[0]): string =>
    renderGridToDataUrl(composeMesp({ ...opts, traits: t }), RENDER_SCALE);

  const idle      = url({ eye: 'open',     feet: 'normal' });
  const blink     = url({ eye: 'blink',    feet: 'normal' });
  const sparkle   = url({ eye: 'sparkle',  feet: 'normal' });
  const jump      = url({ eye: 'sparkle',  feet: 'jump', bodyDy: -1 });
  const fall      = url({ eye: 'open',     feet: 'fall', bodyDy: 1 });
  const confused  = url({ eye: 'confused', feet: 'crouch', sweatDrop: true });
  const alert     = url({ eye: 'sparkle',  feet: 'normal' });
  const sleep     = url({ eye: 'closed',   feet: 'sit' });
  const sit       = url({ eye: 'open',     feet: 'sit' });

  const walkingFrames = buildWalkingFrames(8, t).map((g) =>
    renderGridToDataUrl(g, RENDER_SCALE),
  );

  const frames: Record<PetState, string[]> = {
    // Idle: piscadinha leve no meio, momento de "sparkle" raro pra animar.
    idle: [
      idle, idle, idle, idle, idle, idle, idle,
      blink,
      idle, idle, idle, idle, idle,
      sparkle, idle, idle,
    ],
    walking: walkingFrames,
    thinking: [confused, idle, confused, idle],
    working: [alert, idle, alert, idle],
    success: [jump, fall, jump, fall],
    error: [confused],
    sleeping: [sleep],
    sitting: [sit],
  };

  const fps: Record<PetState, number> = {
    idle: 2,
    walking: 12,
    thinking: 2,
    working: 3,
    success: 4,
    error: 1,
    sleeping: 1,
    sitting: 2,
  };

  const flips: Record<string, boolean> = {};
  for (const u of walkingFrames) flips[u] = true;

  // Mapa de pupila DOM por frame.
  const eye: Record<string, EyeConfig | null> = {
    [idle]:      DEFAULT_EYE_CONFIG,
    [sparkle]:   DEFAULT_EYE_CONFIG,
    [jump]:      DEFAULT_EYE_CONFIG,
    [fall]:      DEFAULT_EYE_CONFIG,
    [alert]:     DEFAULT_EYE_CONFIG,
    [sit]:       DEFAULT_EYE_CONFIG,
    [blink]:     null,
    [sleep]:     null,
    [confused]:  null,
  };
  for (const u of walkingFrames) eye[u] = DEFAULT_EYE_CONFIG;

  return { frames, fps, flips, eye };
}

// Cache sprite sets by serialized traits to avoid regenerating.
const spriteCache = new Map<string, SpriteSet>();
const MAX_CACHE_ENTRIES = 32;

function traitsKey(traits: MespTraits): string {
  return `${traits.palette.bodyMid}-${traits.palette.bodyHi}-${traits.palette.bodyLo}-${traits.accessory}-${traits.spots}-${traits.spotColor}`;
}

export function getSpritesForTraits(traits: MespTraits): SpriteSet {
  const key = traitsKey(traits);
  let set = spriteCache.get(key);
  if (!set) {
    // Eviction simples: quando ultrapassa o limite, descarta a entrada mais
    // antiga (Map preserva ordem de inserção).
    if (spriteCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = spriteCache.keys().next().value;
      if (oldest !== undefined) spriteCache.delete(oldest);
    }
    set = buildSpriteSet(traits);
    spriteCache.set(key, set);
  }
  return set;
}

// ---------------------------------------------------------------------------
//  Default sprite set (paleta padrão; usado como fallback)
// ---------------------------------------------------------------------------

const defaultSet = buildSpriteSet(DEFAULT_TRAITS);

export const STATE_FRAMES = defaultSet.frames;
export const STATE_FPS = defaultSet.fps;
export const SPRITE_FLIPS_ON_RIGHT = defaultSet.flips;
export const SPRITE_EYE = defaultSet.eye;
