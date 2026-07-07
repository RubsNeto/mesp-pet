// src/procedural/traitsCatalog.mjs
//
// Catalogos ordenados + helpers PUROS de traits do MESP. Sem dependencia de
// DOM/localStorage — testado em tests/traitsCatalog.test.mjs. E' a fonte unica
// das familias de cor, cores de mancha, listas de acessorios/padroes e da
// logica de construcao de paleta usada tanto pela geracao aleatoria quanto
// pela UI de customizacao.

/**
 * Campos da paleta que NAO variam por familia (contorno, olho, pupila, zzz).
 * Mesmos valores de DEFAULT_PALETTE em palette.ts.
 */
export const INVARIANT_PALETTE = {
  outline: '#162033',
  eyeWhite: '#ffffff',
  pupil: '#162033',
  zzz: '#cdd6f4',
};

/**
 * Familias de cor — cada uma tem hi, mid, lo coordenados (mesma matiz).
 */
export const FAMILIES = [
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
  { name: 'onyx',    hi: '#4a4f5c', mid: '#2b2f3a', lo: '#12151c', belly: '#5a606e' },
  { name: 'snow',    hi: '#ffffff', mid: '#eef1f6', lo: '#c1c8d6', belly: '#ffffff' },
  { name: 'rainbow', hi: '#ff8ac0', mid: '#7ad0ff', lo: '#b48aef', belly: '#fff2fb' },
  { name: 'galaxy',  hi: '#b98af0', mid: '#6a3fb1', lo: '#2a1b4a', belly: '#d9c8ff' },
  { name: 'gold',    hi: '#ffe9a8', mid: '#f2c14e', lo: '#a9791b', belly: '#fff6da' },
  { name: 'neon',    hi: '#b9ffec', mid: '#26ffb0', lo: '#00b37a', belly: '#e6fff6' },
];

/** Cores possiveis para manchas — neutras ou complementares. */
export const SPOT_COLORS = [
  '#ffffff', // branco
  '#fff3a3', // creme
  '#ffd6e8', // rosa pastel
  '#cdf2cf', // verde pastel
  '#dad6f5', // lavanda pastel
  '#3b3550', // navy escuro (bom em pets claros)
];

/** Lista ordenada de acessorios disponiveis (para galerias de UI). */
export const ACCESSORIES = [
  'none', 'ears', 'horns', 'antenna', 'bow', 'flower', 'star', 'halo',
  'glasses', 'sunglasses', 'cap', 'tophat', 'crown', 'headphones',
  'monocle', 'eyepatch', 'glasses_square', 'glasses_heart',
  'beanie', 'witchhat', 'beret', 'chefhat',
];

/**
 * Acessorios agrupados por "slot" para permitir combinacoes coerentes
 * (um de cabeca + um de rosto). 'none' pertence a ambos.
 */
export const HEAD_ACCESSORIES = ['none', 'ears', 'horns', 'antenna', 'bow', 'flower', 'star', 'halo', 'cap', 'tophat', 'crown', 'beanie', 'witchhat', 'beret', 'chefhat'];
export const FACE_ACCESSORIES = ['none', 'glasses', 'sunglasses', 'headphones', 'monocle', 'eyepatch', 'glasses_square', 'glasses_heart'];

/** Lista ordenada de padroes de mancha disponiveis (para galerias de UI). */
export const SPOT_PATTERNS = ['none', 'belly', 'patches', 'stripe', 'heart', 'polka', 'checker', 'waves', 'stars', 'camo', 'circuit'];

/** Formatos de olho. */
export const EYE_STYLES = ['round', 'cat', 'heart', 'star', 'happy', 'sleepy'];
/** Estilos de tufo. */
export const TUFT_STYLES = ['drop', 'flat', 'spiky', 'fringe', 'swirl', 'bald'];
/** Estilos de boca. */
export const MOUTH_STYLES = ['none', 'smile', 'open', 'cat', 'tongue', 'serious'];
/** Formatos de corpo. */
export const BODY_SHAPES = ['squircle', 'round', 'tall', 'flat', 'star'];
/** Sobrancelhas. */
export const BROW_STYLES = ['none', 'flat', 'arched', 'angry'];
/** Acessorios de pescoco. */
export const NECK_STYLES = ['none', 'scarf', 'tie', 'bowtie'];
/** Acessorios de costas. */
export const BACK_STYLES = ['none', 'backpack', 'cape', 'wings'];
/** Objetos segurados. */
export const HELD_ITEMS = ['none', 'coffee', 'laptop', 'balloon', 'lollipop'];
/** Texturas de material. */
export const MATERIALS = ['matte', 'metallic', 'ghost', 'jelly'];
/** Marcas faciais. */
export const FACE_MARKS = ['none', 'freckles', 'dots', 'scar', 'heartcheek'];
/** Estilos de contorno. */
export const OUTLINE_MODES = ['dark', 'family', 'none', 'white'];
/** Direcoes de gradiente. */
export const GRADIENT_DIRS = ['vertical', 'horizontal', 'diagonal', 'radial'];
/** Auras de particulas. */
export const AURAS = ['none', 'sparkles', 'hearts', 'flames', 'snow', 'leaves'];
/** Estilos de animacao. */
export const ANIM_STYLES = ['breathe', 'bouncy', 'float', 'jitter'];

/** Cor padrao das bochechas coradas. */
export const DEFAULT_BLUSH_COLOR = '#ff9dbb';

/** Rotulos amigaveis (pt-BR). */
export const ACCESSORY_LABELS = {
  none: 'Nenhum',
  ears: 'Orelhas',
  horns: 'Chifres',
  antenna: 'Antena',
  bow: 'Lacinho',
  flower: 'Florzinha',
  star: 'Estrela',
  halo: 'Aureola',
  glasses: 'Oculos',
  sunglasses: 'Oculos escuro',
  cap: 'Bone',
  tophat: 'Cartola',
  crown: 'Coroa',
  headphones: 'Fone',
  monocle: 'Monoculo',
  eyepatch: 'Tapa-olho',
  glasses_square: 'Oculos quadrado',
  glasses_heart: 'Oculos coracao',
  beanie: 'Gorro',
  witchhat: 'Chapeu de bruxa',
  beret: 'Boina',
  chefhat: 'Chapeu de chef',
};

export const SPOT_LABELS = {
  none: 'Nenhum',
  belly: 'Barriga clara',
  patches: 'Manchas',
  stripe: 'Faixa',
  heart: 'Coracao',
  polka: 'Bolinhas',
  checker: 'Xadrez',
  waves: 'Ondas',
  stars: 'Estrelinhas',
  camo: 'Camuflagem',
  circuit: 'Circuito',
};

export const EYE_LABELS = {
  round: 'Redondo',
  cat: 'Gatinho',
  heart: 'Coracao',
  star: 'Estrela',
  happy: 'Feliz',
  sleepy: 'Sonolento',
};

export const TUFT_LABELS = {
  drop: 'Gota',
  flat: 'Liso',
  spiky: 'Espetado',
  fringe: 'Franjinha',
  swirl: 'Redemoinho',
  bald: 'Careca',
};

export const MOUTH_LABELS = {
  none: 'Nenhuma',
  smile: 'Sorriso',
  open: 'Aberta',
  cat: 'Gatinho',
  tongue: 'Linguinha',
  serious: 'Serio',
};

export const BODY_SHAPE_LABELS = {
  squircle: 'Padrao',
  round: 'Redondo',
  tall: 'Alto',
  flat: 'Achatado',
  star: 'Estrelinha',
};

export const BROW_LABELS = { none: 'Nenhuma', flat: 'Retas', arched: 'Arqueadas', angry: 'Zangadas' };
export const NECK_LABELS = { none: 'Nenhum', scarf: 'Cachecol', tie: 'Gravata', bowtie: 'Gravata-borboleta' };
export const BACK_LABELS = { none: 'Nenhum', backpack: 'Mochila', cape: 'Capa', wings: 'Asas' };
export const HELD_LABELS = { none: 'Nada', coffee: 'Cafe', laptop: 'Laptop', balloon: 'Balao', lollipop: 'Pirulito' };
export const MATERIAL_LABELS = { matte: 'Fosco', metallic: 'Metalico', ghost: 'Fantasma', jelly: 'Geleia' };
export const MARK_LABELS = { none: 'Nenhuma', freckles: 'Sardas', dots: 'Pintinhas', scar: 'Cicatriz', heartcheek: 'Coracao na bochecha' };
export const OUTLINE_LABELS = { dark: 'Escuro', family: 'Colorido', none: 'Sem contorno', white: 'Branco' };
export const GRADIENT_DIR_LABELS = { vertical: 'Vertical', horizontal: 'Horizontal', diagonal: 'Diagonal', radial: 'Radial' };
export const AURA_LABELS = { none: 'Nenhuma', sparkles: 'Faiscas', hearts: 'Coracoes', flames: 'Chamas', snow: 'Neve', leaves: 'Folhas' };
export const ANIM_LABELS = { breathe: 'Respirar', bouncy: 'Saltitante', float: 'Flutuar', jitter: 'Vibrar' };

export const FAMILY_LABELS = {
  sky: 'Ceu',
  rose: 'Rosa',
  mint: 'Menta',
  lemon: 'Limao',
  lilac: 'Lilas',
  peach: 'Pessego',
  lavender: 'Lavanda',
  cream: 'Creme',
  aqua: 'Agua',
  coral: 'Coral',
  sage: 'Salvia',
  ghost: 'Fantasma',
  onyx: 'Onix',
  snow: 'Neve',
  rainbow: 'Arco-iris',
  galaxy: 'Galaxia',
  gold: 'Dourado',
  neon: 'Neon',
};

/** Temas prontos — aplicam varias caracteristicas de uma vez. */
export const THEME_PRESETS = [
  { id: 'kawaii', label: 'Kawaii pastel', emoji: '🌸', patch: { family: 'rose', accessories: ['bow'], spots: 'heart', spotColor: '#ffd6e8', eyeStyle: 'happy', mouth: 'cat', blush: true } },
  { id: 'cyber', label: 'Cyberpunk', emoji: '🤖', patch: { family: 'lilac', accessories: ['sunglasses'], spots: 'stripe', spotColor: '#3b3550', eyeStyle: 'round', mouth: 'serious', blush: false } },
  { id: 'dark', label: 'Modo escuro', emoji: '🌚', patch: { family: 'ghost', accessories: ['headphones'], spots: 'none', eyeStyle: 'sleepy', mouth: 'smile', blush: false } },
  { id: 'halloween', label: 'Halloween', emoji: '🎃', patch: { family: 'peach', accessories: ['horns'], spots: 'patches', spotColor: '#3b3550', eyeStyle: 'cat', mouth: 'open', blush: false } },
  { id: 'royal', label: 'Realeza', emoji: '👑', patch: { family: 'lemon', accessories: ['crown'], spots: 'none', eyeStyle: 'star', mouth: 'smile', blush: true } },
  { id: 'angel', label: 'Anjinho', emoji: '😇', patch: { family: 'sky', accessories: ['halo'], spots: 'none', eyeStyle: 'happy', mouth: 'smile', blush: true } },
];

/** Escurece uma cor hex por uma fracao (0..1). */
export function darken(hex, amount) {
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

/** Localiza uma familia por nome (fallback: primeira familia = sky). */
export function findFamily(name) {
  return FAMILIES.find((f) => f.name === name) ?? FAMILIES[0];
}

/**
 * Constroi uma paleta MESP a partir de uma familia. Pes e barriga sao
 * derivados da propria familia.
 */
export function buildPaletteFromFamily(familyName) {
  const fam = findFamily(familyName);
  return {
    ...INVARIANT_PALETTE,
    bodyHi: fam.hi,
    bodyMid: fam.mid,
    bodyLo: fam.lo,
    belly: fam.belly,
    feetHi: fam.lo,
    feetLo: darken(fam.lo, 0.25),
  };
}

/** Mescla um override parcial de cores sobre uma paleta existente. */
export function applyPaletteOverride(palette, partial) {
  return { ...palette, ...(partial || {}) };
}

/**
 * Cria um MespTraits completo a partir de escolhas do usuario. A paleta parte
 * da familia e recebe overrides opcionais.
 */
export function makeTraits(input) {
  const base = buildPaletteFromFamily(input.family);
  const palette = input.paletteOverride ? applyPaletteOverride(base, input.paletteOverride) : base;
  const accessories = Array.isArray(input.accessories)
    ? input.accessories.filter((a) => a && a !== 'none')
    : input.accessory && input.accessory !== 'none'
      ? [input.accessory]
      : [];
  return {
    palette,
    accessory: accessories[0] ?? 'none',
    accessories,
    spots: input.spots ?? 'none',
    spotColor: input.spotColor ?? '#ffffff',
    family: input.family,
    name: typeof input.name === 'string' ? input.name : '',
    eyeStyle: input.eyeStyle ?? 'round',
    tuft: input.tuft ?? 'drop',
    mouth: input.mouth ?? 'none',
    blush: input.blush ?? false,
    blushColor: input.blushColor ?? DEFAULT_BLUSH_COLOR,
    gradient: input.gradient ?? false,
    gradientDir: input.gradientDir ?? 'vertical',
    scale: clampScale(input.scale),
    bodyShape: input.bodyShape ?? 'squircle',
    eyeCount: input.eyeCount === 2 || input.eyeCount === 3 ? input.eyeCount : 1,
    brows: input.brows ?? 'none',
    neck: input.neck ?? 'none',
    back: input.back ?? 'none',
    held: input.held ?? 'none',
    material: input.material ?? 'matte',
    marks: input.marks ?? 'none',
    outlineMode: input.outlineMode ?? 'dark',
    aura: input.aura ?? 'none',
    animStyle: input.animStyle ?? 'breathe',
  };
}

/** Limita a escala do pet ao intervalo suportado. */
export function clampScale(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.max(0.6, Math.min(1.6, n));
}

/**
 * Normaliza a lista de acessorios efetivos de um trait (multi -> array,
 * fallback p/ o acessorio unico legado). Remove 'none' e duplicatas.
 */
export function resolveAccessories(traits) {
  const raw = Array.isArray(traits.accessories) && traits.accessories.length > 0
    ? traits.accessories
    : traits.accessory && traits.accessory !== 'none'
      ? [traits.accessory]
      : [];
  const seen = new Set();
  const out = [];
  for (const a of raw) {
    if (a && a !== 'none' && !seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

/** Codifica traits para uma string compartilhavel (base64 de JSON). */
export function encodeTraits(traits) {
  const json = JSON.stringify(traits);
  const g = globalThis;
  if (typeof g.btoa === 'function') {
    return g.btoa(unescape(encodeURIComponent(json)));
  }
  return g.Buffer.from(json, 'utf8').toString('base64');
}

/** Decodifica uma string de traits; retorna objeto cru ou null. */
export function decodeTraits(code) {
  if (typeof code !== 'string' || !code.trim()) return null;
  try {
    const g = globalThis;
    let json;
    if (typeof g.atob === 'function') {
      json = decodeURIComponent(escape(g.atob(code.trim())));
    } else {
      json = g.Buffer.from(code.trim(), 'base64').toString('utf8');
    }
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}
