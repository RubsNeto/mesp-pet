// src/procedural/traits.ts
// Sistema de variação aleatória para cada MESP.
//
// Princípios:
//   • Paletas pensadas como uma família — body hi/mid/lo são tons da MESMA
//     cor. Pés derivam de body mid/lo (mais escuros).
//   • Acessórios e spots têm distribuição balanceada — 'none' aparece com peso
//     extra para que MESPs simples sejam comuns; só uma minoria tem acessório.
//   • Combinações esquisitas (ex.: halo + horns) não acontecem porque cada pet
//     escolhe APENAS UM acessório.
//   • Cor de mancha é sempre uma cor neutra/contraste com o corpo.

import type { MespPalette } from './palette';
import { DEFAULT_PALETTE } from './palette';

export type Accessory =
  | 'none'
  | 'horns'
  | 'ears'
  | 'antenna'
  | 'bow'
  | 'halo'
  | 'flower'
  | 'star';

export type SpotPattern = 'none' | 'belly' | 'patches' | 'stripe' | 'heart';

export interface MespTraits {
  /** Cores derivadas do corpo + outline. */
  palette: MespPalette;
  /** Acessório escolhido (apenas um). */
  accessory: Accessory;
  /** Padrão de manchas. */
  spots: SpotPattern;
  /** Cor das manchas (quando spots !== 'none'). */
  spotColor: string;
  /** Identificador da família de cor (para debug e seeds futuros). */
  family: string;
}

/**
 * Famílias de cor — cada uma tem hi, mid, lo coordenados (mesma matiz).
 * Cores escolhidas para serem suaves e amigáveis (estilo "pastel kawaii"
 * com saturação moderada, não neon).
 */
interface ColorFamily {
  name: string;
  hi: string;
  mid: string;
  lo: string;
  /** Cor de barriga (pra spots='belly') — bem clara. */
  belly: string;
}

const FAMILIES: ColorFamily[] = [
  { name: 'sky',     hi: '#b6ecff', mid: '#6fcfee', lo: '#3a8fb8', belly: '#e7f7ff' },
  { name: 'rose',    hi: '#ffd5e3', mid: '#f48ab2', lo: '#b94677', belly: '#ffeef4' },
  { name: 'mint',    hi: '#cdf5d6', mid: '#7adf99', lo: '#3a9b62', belly: '#ecfaef' },
  { name: 'lemon',   hi: '#fff5b8', mid: '#f3d966', lo: '#b69820', belly: '#fffae0' },
  { name: 'lilac',   hi: '#e0d0ff', mid: '#b48aef', lo: '#6e3fb1', belly: '#f3eaff' },
  { name: 'peach',   hi: '#ffd9c3', mid: '#f7a07b', lo: '#c45f3b', belly: '#fff0e6' },
  { name: 'lavender',hi: '#dde7ff', mid: '#9eaeff', lo: '#5466c5', belly: '#eef3ff' },
  { name: 'cream',   hi: '#fff1d8', mid: '#f0cf9e', lo: '#a78048', belly: '#fff7e9' },
  { name: 'aqua',    hi: '#bff5ee', mid: '#62ddc8', lo: '#258b7c', belly: '#e6faf6' },
  { name: 'coral',   hi: '#ffc6c0', mid: '#f57870', lo: '#b53a30', belly: '#ffe7e3' },
  { name: 'sage',    hi: '#dcecc7', mid: '#a3c177', lo: '#5a7a35', belly: '#eef5dd' },
  { name: 'ghost',   hi: '#f4f6fa', mid: '#cdd2dc', lo: '#7a8294', belly: '#fbfcfe' },
];

/** Cores possíveis para manchas — neutras ou complementares, com contraste suave. */
const SPOT_COLORS = [
  '#ffffff', // branco
  '#fff3a3', // creme
  '#ffd6e8', // rosa pastel
  '#cdf2cf', // verde pastel
  '#dad6f5', // lavanda pastel
  '#3b3550', // navy escuro (bom em pets claros)
];

/**
 * Pesos para sortear o acessório. 'none' tem peso alto para
 * MESPs sem adornos serem o caso mais comum (~50% dos pets).
 */
const ACCESSORY_WEIGHTS: Array<[Accessory, number]> = [
  ['none',    50],
  ['ears',     8],
  ['horns',    7],
  ['bow',      8],
  ['antenna',  7],
  ['flower',   8],
  ['star',     6],
  ['halo',     6],
];

/** Pesos para spots — também 'none' bem comum. */
const SPOT_WEIGHTS: Array<[SpotPattern, number]> = [
  ['none',    55],
  ['belly',   18],
  ['patches', 10],
  ['stripe',   7],
  ['heart',   10],
];

function weightedPick<T>(table: Array<[T, number]>): T {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [val, w] of table) {
    r -= w;
    if (r <= 0) return val;
  }
  return table[0]![0];
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function generateTraits(): MespTraits {
  const fam = pick(FAMILIES);
  const palette: MespPalette = {
    ...DEFAULT_PALETTE,
    bodyHi: fam.hi,
    bodyMid: fam.mid,
    bodyLo: fam.lo,
    belly: fam.belly,
    feetHi: fam.lo,
    feetLo: darken(fam.lo, 0.25),
  };

  const accessory = weightedPick(ACCESSORY_WEIGHTS);
  const spots = weightedPick(SPOT_WEIGHTS);
  const spotColor = pick(SPOT_COLORS);

  return {
    palette,
    accessory,
    spots,
    spotColor,
    family: fam.name,
  };
}

/** Default traits (família "sky" — MESP azul clássico). */
export const DEFAULT_TRAITS: MespTraits = (() => {
  const fam = FAMILIES[0]!;
  return {
    palette: {
      ...DEFAULT_PALETTE,
      bodyHi: fam.hi,
      bodyMid: fam.mid,
      bodyLo: fam.lo,
      belly: fam.belly,
      feetHi: fam.lo,
      feetLo: darken(fam.lo, 0.25),
    },
    accessory: 'none',
    spots: 'none',
    spotColor: '#ffffff',
    family: fam.name,
  };
})();

function darken(hex: string, amount: number): string {
  const s = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const f = 1 - amount;
  const rr = Math.max(0, Math.min(255, Math.round(r * f)));
  const gg = Math.max(0, Math.min(255, Math.round(g * f)));
  const bb = Math.max(0, Math.min(255, Math.round(b * f)));
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

/**
 * Reidrata traits a partir de uma versão serializada (localStorage).
 * Resiliente a formatos antigos: campos faltando viram defaults.
 */
export function deserializeTraits(raw: unknown): MespTraits | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MespTraits>;
  if (!r.palette || typeof r.palette !== 'object') return null;
  return {
    palette: {
      ...DEFAULT_PALETTE,
      ...r.palette,
    },
    accessory: (r.accessory as Accessory) || 'none',
    spots: (r.spots as SpotPattern) || 'none',
    spotColor: (typeof r.spotColor === 'string' && r.spotColor) || '#ffffff',
    family: (typeof r.family === 'string' && r.family) || 'custom',
  };
}
