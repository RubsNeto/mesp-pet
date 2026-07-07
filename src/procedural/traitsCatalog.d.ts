// src/procedural/traitsCatalog.d.ts
import type { MespPalette } from './palette';
import type {
  Accessory, SpotPattern, MespTraits, EyeStyle, TuftStyle, MouthStyle,
  BodyShape, BrowStyle, NeckStyle, BackStyle, HeldItem, MaterialStyle,
  FaceMark, OutlineMode, GradientDir, AuraStyle, AnimStyle,
} from './traits';

export interface ColorFamily {
  name: string;
  hi: string;
  mid: string;
  lo: string;
  belly: string;
}

export const INVARIANT_PALETTE: Pick<MespPalette, 'outline' | 'eyeWhite' | 'pupil' | 'zzz'>;
export const FAMILIES: ColorFamily[];
export const SPOT_COLORS: string[];
export const ACCESSORIES: readonly Accessory[];
export const HEAD_ACCESSORIES: readonly Accessory[];
export const FACE_ACCESSORIES: readonly Accessory[];
export const SPOT_PATTERNS: readonly SpotPattern[];
export const EYE_STYLES: readonly EyeStyle[];
export const TUFT_STYLES: readonly TuftStyle[];
export const MOUTH_STYLES: readonly MouthStyle[];
export const BODY_SHAPES: readonly BodyShape[];
export const BROW_STYLES: readonly BrowStyle[];
export const NECK_STYLES: readonly NeckStyle[];
export const BACK_STYLES: readonly BackStyle[];
export const HELD_ITEMS: readonly HeldItem[];
export const MATERIALS: readonly MaterialStyle[];
export const FACE_MARKS: readonly FaceMark[];
export const OUTLINE_MODES: readonly OutlineMode[];
export const GRADIENT_DIRS: readonly GradientDir[];
export const AURAS: readonly AuraStyle[];
export const ANIM_STYLES: readonly AnimStyle[];
export const DEFAULT_BLUSH_COLOR: string;
export const ACCESSORY_LABELS: Record<Accessory, string>;
export const SPOT_LABELS: Record<SpotPattern, string>;
export const EYE_LABELS: Record<EyeStyle, string>;
export const TUFT_LABELS: Record<TuftStyle, string>;
export const MOUTH_LABELS: Record<MouthStyle, string>;
export const BODY_SHAPE_LABELS: Record<BodyShape, string>;
export const BROW_LABELS: Record<BrowStyle, string>;
export const NECK_LABELS: Record<NeckStyle, string>;
export const BACK_LABELS: Record<BackStyle, string>;
export const HELD_LABELS: Record<HeldItem, string>;
export const MATERIAL_LABELS: Record<MaterialStyle, string>;
export const MARK_LABELS: Record<FaceMark, string>;
export const OUTLINE_LABELS: Record<OutlineMode, string>;
export const GRADIENT_DIR_LABELS: Record<GradientDir, string>;
export const AURA_LABELS: Record<AuraStyle, string>;
export const ANIM_LABELS: Record<AnimStyle, string>;
export const FAMILY_LABELS: Record<string, string>;

export interface ThemePreset {
  id: string;
  label: string;
  emoji: string;
  patch: Partial<MespTraits>;
}
export const THEME_PRESETS: ThemePreset[];

export function darken(hex: string, amount: number): string;
export function findFamily(name: string): ColorFamily;
export function buildPaletteFromFamily(familyName: string): MespPalette;
export function applyPaletteOverride(palette: MespPalette, partial: Partial<MespPalette>): MespPalette;
export function clampScale(v: unknown): number;
export function resolveAccessories(traits: MespTraits): Accessory[];
export function encodeTraits(traits: MespTraits): string;
export function decodeTraits(code: string): unknown;

export interface MakeTraitsInput {
  family: string;
  accessory?: Accessory;
  accessories?: Accessory[];
  spots?: SpotPattern;
  spotColor?: string;
  paletteOverride?: Partial<MespPalette>;
  name?: string;
  eyeStyle?: EyeStyle;
  tuft?: TuftStyle;
  mouth?: MouthStyle;
  blush?: boolean;
  blushColor?: string;
  gradient?: boolean;
  gradientDir?: GradientDir;
  scale?: number;
  bodyShape?: BodyShape;
  eyeCount?: number;
  brows?: BrowStyle;
  neck?: NeckStyle;
  back?: BackStyle;
  held?: HeldItem;
  material?: MaterialStyle;
  marks?: FaceMark;
  outlineMode?: OutlineMode;
  aura?: AuraStyle;
  animStyle?: AnimStyle;
}
export function makeTraits(input: MakeTraitsInput): MespTraits;
