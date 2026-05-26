// src/procedural/traits.ts
// Sistema de variação aleatória para cada MESP.

import type { MespPalette } from './palette';
import { DEFAULT_PALETTE } from './palette';

export type Accessory = 'none' | 'horns' | 'ears' | 'antenna' | 'bow' | 'halo';
export type SpotPattern = 'none' | 'belly' | 'patches' | 'stripe';

export interface MespTraits {
  palette: MespPalette;
  accessory: Accessory;
  spots: SpotPattern;
  /** Spot color (used when spots !== 'none'). */
  spotColor: string;
}

const BODY_COLORS: Array<{ hi: string; mid: string; lo: string }> = [
  { hi: '#9fe1f7', mid: '#5fc3eb', lo: '#2e8fc1' }, // azul (original)
  { hi: '#f7b8d0', mid: '#eb6fa0', lo: '#c13a6e' }, // rosa
  { hi: '#b8f7c5', mid: '#5feb82', lo: '#2ec15a' }, // verde
  { hi: '#f7e6b8', mid: '#ebc35f', lo: '#c19a2e' }, // dourado
  { hi: '#d4b8f7', mid: '#a05feb', lo: '#6e2ec1' }, // roxo
  { hi: '#f7c8b8', mid: '#eb7f5f', lo: '#c1502e' }, // laranja
  { hi: '#f7f7b8', mid: '#ebeb5f', lo: '#c1c12e' }, // amarelo
  { hi: '#b8f7f7', mid: '#5febeb', lo: '#2ec1c1' }, // ciano
  { hi: '#f7b8b8', mid: '#eb5f5f', lo: '#c12e2e' }, // vermelho
  { hi: '#c8c8c8', mid: '#888888', lo: '#555555' }, // cinza
];

const SPOT_COLORS = ['#ffffff', '#f7e6b8', '#ffd6e8', '#d4f7d4', '#333333'];

const ACCESSORIES: Accessory[] = ['none', 'none', 'horns', 'ears', 'antenna', 'bow', 'halo'];

const SPOT_PATTERNS: SpotPattern[] = ['none', 'none', 'none', 'belly', 'patches', 'stripe'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function generateTraits(): MespTraits {
  const colors = pick(BODY_COLORS);
  const palette: MespPalette = {
    ...DEFAULT_PALETTE,
    bodyHi: colors.hi,
    bodyMid: colors.mid,
    bodyLo: colors.lo,
    feetHi: colors.mid,
    feetLo: colors.lo,
  };

  return {
    palette,
    accessory: pick(ACCESSORIES),
    spots: pick(SPOT_PATTERNS),
    spotColor: pick(SPOT_COLORS),
  };
}

/** Default traits (original blue MESP). */
export const DEFAULT_TRAITS: MespTraits = {
  palette: DEFAULT_PALETTE,
  accessory: 'none',
  spots: 'none',
  spotColor: '#ffffff',
};
