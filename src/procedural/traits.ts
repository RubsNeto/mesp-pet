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
import {
  FAMILIES,
  SPOT_COLORS,
  EYE_STYLES,
  TUFT_STYLES,
  MOUTH_STYLES,
  SPOT_PATTERNS,
  BODY_SHAPES,
  BROW_STYLES,
  NECK_STYLES,
  BACK_STYLES,
  HELD_ITEMS,
  MATERIALS,
  FACE_MARKS,
  OUTLINE_MODES,
  GRADIENT_DIRS,
  AURAS,
  ANIM_STYLES,
  DEFAULT_BLUSH_COLOR,
  buildPaletteFromFamily,
  makeTraits,
  clampScale,
} from './traitsCatalog';

// Re-exporta o catalogo + helpers puros (fonte unica em traitsCatalog.mjs)
// para que consumidores importem tudo de './traits'.
export {
  FAMILIES,
  SPOT_COLORS,
  ACCESSORIES,
  HEAD_ACCESSORIES,
  FACE_ACCESSORIES,
  SPOT_PATTERNS,
  EYE_STYLES,
  TUFT_STYLES,
  MOUTH_STYLES,
  BODY_SHAPES,
  BROW_STYLES,
  NECK_STYLES,
  BACK_STYLES,
  HELD_ITEMS,
  MATERIALS,
  FACE_MARKS,
  OUTLINE_MODES,
  GRADIENT_DIRS,
  AURAS,
  ANIM_STYLES,
  DEFAULT_BLUSH_COLOR,
  ACCESSORY_LABELS,
  SPOT_LABELS,
  EYE_LABELS,
  TUFT_LABELS,
  MOUTH_LABELS,
  BODY_SHAPE_LABELS,
  BROW_LABELS,
  NECK_LABELS,
  BACK_LABELS,
  HELD_LABELS,
  MATERIAL_LABELS,
  MARK_LABELS,
  OUTLINE_LABELS,
  GRADIENT_DIR_LABELS,
  AURA_LABELS,
  ANIM_LABELS,
  FAMILY_LABELS,
  THEME_PRESETS,
  INVARIANT_PALETTE,
  darken,
  findFamily,
  buildPaletteFromFamily,
  applyPaletteOverride,
  clampScale,
  resolveAccessories,
  encodeTraits,
  decodeTraits,
  makeTraits,
} from './traitsCatalog';
export type { ColorFamily, MakeTraitsInput, ThemePreset } from './traitsCatalog';

export type Accessory =
  | 'none'
  | 'horns'
  | 'ears'
  | 'antenna'
  | 'bow'
  | 'halo'
  | 'flower'
  | 'star'
  | 'glasses'
  | 'sunglasses'
  | 'cap'
  | 'tophat'
  | 'crown'
  | 'headphones'
  // rosto extras
  | 'monocle'
  | 'eyepatch'
  | 'glasses_square'
  | 'glasses_heart'
  // cabeça extras
  | 'beanie'
  | 'witchhat'
  | 'beret'
  | 'chefhat';

export type SpotPattern =
  | 'none'
  | 'belly'
  | 'patches'
  | 'stripe'
  | 'heart'
  | 'polka'
  | 'checker'
  | 'waves'
  | 'stars'
  | 'camo'
  | 'circuit';

/** Formato do olho (aplicado ao estado de repouso "open"/"sparkle"). */
export type EyeStyle = 'round' | 'cat' | 'heart' | 'star' | 'happy' | 'sleepy';

/** Estilo do tufo/cabelo no topo do corpo. */
export type TuftStyle = 'drop' | 'flat' | 'spiky' | 'fringe' | 'swirl' | 'bald';

/** Boca/expressão base do MESP. */
export type MouthStyle = 'none' | 'smile' | 'open' | 'cat' | 'tongue' | 'serious';

/** Formato do corpo. */
export type BodyShape = 'squircle' | 'round' | 'tall' | 'flat' | 'star';

/** Sobrancelhas. */
export type BrowStyle = 'none' | 'flat' | 'arched' | 'angry';

/** Acessório de pescoço. */
export type NeckStyle = 'none' | 'scarf' | 'tie' | 'bowtie';

/** Acessório de costas (camada traseira). */
export type BackStyle = 'none' | 'backpack' | 'cape' | 'wings';

/** Objeto segurado. */
export type HeldItem = 'none' | 'coffee' | 'laptop' | 'balloon' | 'lollipop';

/** Textura de material do corpo. */
export type MaterialStyle = 'matte' | 'metallic' | 'ghost' | 'jelly';

/** Marcas faciais. */
export type FaceMark = 'none' | 'freckles' | 'dots' | 'scar' | 'heartcheek';

/** Estilo do contorno. */
export type OutlineMode = 'dark' | 'family' | 'none' | 'white';

/** Direção do gradiente de corpo. */
export type GradientDir = 'vertical' | 'horizontal' | 'diagonal' | 'radial';

/** Aura de partículas ao redor do pet. */
export type AuraStyle = 'none' | 'sparkles' | 'hearts' | 'flames' | 'snow' | 'leaves';

/** Ritmo/estilo de animação em repouso. */
export type AnimStyle = 'breathe' | 'bouncy' | 'float' | 'jitter';

export interface MespTraits {
  /** Cores derivadas do corpo + outline. */
  palette: MespPalette;
  /** Acessório principal (compat retro; single-select). */
  accessory: Accessory;
  /** Acessórios em camadas (multi). Quando presente, tem prioridade sobre `accessory`. */
  accessories?: Accessory[];
  /** Padrão de manchas. */
  spots: SpotPattern;
  /** Cor das manchas (quando spots !== 'none'). */
  spotColor: string;
  /** Identificador da família de cor (para debug e seeds futuros). */
  family: string;
  /** Nome do MESP (opcional). */
  name?: string;
  /** Formato do olho. */
  eyeStyle?: EyeStyle;
  /** Estilo do tufo. */
  tuft?: TuftStyle;
  /** Boca/expressão. */
  mouth?: MouthStyle;
  /** Mostrar bochechas coradas. */
  blush?: boolean;
  /** Cor das bochechas (quando blush). */
  blushColor?: string;
  /** Corpo com gradiente (usa bodyHi→bodyLo) em vez de cor sólida. */
  gradient?: boolean;
  /** Direção do gradiente. */
  gradientDir?: GradientDir;
  /** Escala do pet na tela (0.6..1.6). 1 = padrão. */
  scale?: number;
  /** Formato do corpo. */
  bodyShape?: BodyShape;
  /** Número de olhos (1, 2 ou 3). */
  eyeCount?: number;
  /** Sobrancelhas. */
  brows?: BrowStyle;
  /** Acessório de pescoço. */
  neck?: NeckStyle;
  /** Acessório de costas. */
  back?: BackStyle;
  /** Objeto segurado. */
  held?: HeldItem;
  /** Textura de material. */
  material?: MaterialStyle;
  /** Marcas faciais. */
  marks?: FaceMark;
  /** Estilo do contorno. */
  outlineMode?: OutlineMode;
  /** Aura de partículas. */
  aura?: AuraStyle;
  /** Estilo de animação em repouso. */
  animStyle?: AnimStyle;
}

/**
 * Pesos para sortear o acessório. 'none' tem peso alto para
 * MESPs sem adornos serem o caso mais comum. (Mantido para referência; a
 * geração atual usa picks separados por slot de cabeça/rosto.)
 */

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
  // Acessorios: as vezes combina um de cabeca + um de rosto.
  const head = weightedPick<Accessory>([
    ['none', 40], ['ears', 6], ['horns', 5], ['bow', 6], ['antenna', 5],
    ['flower', 5], ['star', 4], ['halo', 4], ['cap', 4], ['tophat', 3], ['crown', 3],
    ['beanie', 3], ['witchhat', 2], ['beret', 3], ['chefhat', 2],
  ]);
  const face = weightedPick<Accessory>([
    ['none', 70], ['glasses', 6], ['sunglasses', 5], ['headphones', 5],
    ['monocle', 3], ['eyepatch', 3], ['glasses_square', 3], ['glasses_heart', 3],
  ]);
  const accessories = [head, face].filter((a): a is Accessory => a !== 'none');

  return {
    palette: buildPaletteFromFamily(fam.name),
    accessory: accessories[0] ?? 'none',
    accessories,
    spots: weightedPick(SPOT_WEIGHTS),
    spotColor: pick(SPOT_COLORS),
    family: fam.name,
    name: '',
    eyeStyle: pick(EYE_STYLES),
    tuft: pick(TUFT_STYLES),
    mouth: weightedPick<MouthStyle>([['none', 40], ['smile', 22], ['cat', 12], ['open', 10], ['tongue', 8], ['serious', 8]]),
    blush: Math.random() < 0.4,
    blushColor: DEFAULT_BLUSH_COLOR,
    gradient: Math.random() < 0.25,
    gradientDir: pick(GRADIENT_DIRS),
    scale: 1,
    bodyShape: weightedPick<BodyShape>([['squircle', 60], ['round', 15], ['tall', 10], ['flat', 8], ['star', 7]]),
    eyeCount: weightedPick<number>([[1, 74], [2, 20], [3, 6]]),
    brows: weightedPick<BrowStyle>([['none', 62], ['flat', 12], ['arched', 14], ['angry', 12]]),
    neck: weightedPick<NeckStyle>([['none', 74], ['scarf', 10], ['tie', 8], ['bowtie', 8]]),
    back: weightedPick<BackStyle>([['none', 80], ['backpack', 7], ['cape', 7], ['wings', 6]]),
    held: weightedPick<HeldItem>([['none', 80], ['coffee', 7], ['laptop', 5], ['balloon', 4], ['lollipop', 4]]),
    material: weightedPick<MaterialStyle>([['matte', 70], ['metallic', 12], ['ghost', 8], ['jelly', 10]]),
    marks: weightedPick<FaceMark>([['none', 68], ['freckles', 12], ['dots', 8], ['scar', 6], ['heartcheek', 6]]),
    outlineMode: weightedPick<OutlineMode>([['dark', 78], ['family', 12], ['none', 5], ['white', 5]]),
    aura: weightedPick<AuraStyle>([['none', 74], ['sparkles', 8], ['hearts', 6], ['flames', 4], ['snow', 4], ['leaves', 4]]),
    animStyle: weightedPick<AnimStyle>([['breathe', 64], ['bouncy', 14], ['float', 14], ['jitter', 8]]),
  };
}

/** Default traits (família "sky" — MESP azul clássico). */
export const DEFAULT_TRAITS: MespTraits = makeTraits({ family: 'sky' });

/**
 * Reidrata traits a partir de uma versão serializada (localStorage).
 * Resiliente a formatos antigos: campos faltando viram defaults.
 */
export function deserializeTraits(raw: unknown): MespTraits | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<MespTraits>;
  if (!r.palette || typeof r.palette !== 'object') return null;
  const accessories = Array.isArray(r.accessories)
    ? (r.accessories.filter((a) => typeof a === 'string' && a !== 'none') as Accessory[])
    : r.accessory && r.accessory !== 'none'
      ? [r.accessory as Accessory]
      : [];
  const eyeCount = r.eyeCount === 2 || r.eyeCount === 3 ? r.eyeCount : 1;
  return {
    palette: {
      ...DEFAULT_PALETTE,
      ...r.palette,
    },
    accessory: accessories[0] ?? ((r.accessory as Accessory) || 'none'),
    accessories,
    spots: isOneOf(r.spots, SPOT_PATTERNS) ? (r.spots as SpotPattern) : 'none',
    spotColor: (typeof r.spotColor === 'string' && r.spotColor) || '#ffffff',
    family: (typeof r.family === 'string' && r.family) || 'custom',
    name: typeof r.name === 'string' ? r.name : '',
    eyeStyle: isOneOf(r.eyeStyle, EYE_STYLES) ? (r.eyeStyle as EyeStyle) : 'round',
    tuft: isOneOf(r.tuft, TUFT_STYLES) ? (r.tuft as TuftStyle) : 'drop',
    mouth: isOneOf(r.mouth, MOUTH_STYLES) ? (r.mouth as MouthStyle) : 'none',
    blush: typeof r.blush === 'boolean' ? r.blush : false,
    blushColor: (typeof r.blushColor === 'string' && r.blushColor) || DEFAULT_BLUSH_COLOR,
    gradient: typeof r.gradient === 'boolean' ? r.gradient : false,
    gradientDir: isOneOf(r.gradientDir, GRADIENT_DIRS) ? (r.gradientDir as GradientDir) : 'vertical',
    scale: clampScale(r.scale),
    bodyShape: isOneOf(r.bodyShape, BODY_SHAPES) ? (r.bodyShape as BodyShape) : 'squircle',
    eyeCount,
    brows: isOneOf(r.brows, BROW_STYLES) ? (r.brows as BrowStyle) : 'none',
    neck: isOneOf(r.neck, NECK_STYLES) ? (r.neck as NeckStyle) : 'none',
    back: isOneOf(r.back, BACK_STYLES) ? (r.back as BackStyle) : 'none',
    held: isOneOf(r.held, HELD_ITEMS) ? (r.held as HeldItem) : 'none',
    material: isOneOf(r.material, MATERIALS) ? (r.material as MaterialStyle) : 'matte',
    marks: isOneOf(r.marks, FACE_MARKS) ? (r.marks as FaceMark) : 'none',
    outlineMode: isOneOf(r.outlineMode, OUTLINE_MODES) ? (r.outlineMode as OutlineMode) : 'dark',
    aura: isOneOf(r.aura, AURAS) ? (r.aura as AuraStyle) : 'none',
    animStyle: isOneOf(r.animStyle, ANIM_STYLES) ? (r.animStyle as AnimStyle) : 'breathe',
  };
}

function isOneOf(v: unknown, arr: readonly string[]): boolean {
  return typeof v === 'string' && arr.includes(v);
}

