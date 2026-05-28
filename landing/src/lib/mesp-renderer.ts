/**
 * Procedural MESP renderer for canvas 2D.
 *
 * Port of scripts/preview-procedural.cjs from the parent project.
 * Renders a 32x32 pixel-art pet at any canvas scale, with configurable
 * color family, accessory, body pattern, and eye expression.
 */

export type FamilyName =
  | 'sky'
  | 'rose'
  | 'mint'
  | 'lemon'
  | 'lilac'
  | 'peach'
  | 'aqua'
  | 'coral'
  | 'lavender'
  | 'cream'
  | 'sage'
  | 'ghost';

export type Accessory =
  | 'none'
  | 'horns'
  | 'ears'
  | 'antenna'
  | 'bow'
  | 'flower'
  | 'halo'
  | 'star';

export type SpotPattern = 'none' | 'belly' | 'patches' | 'stripe' | 'heart';

export type EyeMode = 'open' | 'sparkle' | 'blink' | 'closed' | 'confused';
export type FeetMode = 'normal' | 'jump' | 'sit' | 'fall' | 'crouch';

export interface MespPalette {
  outline: string;
  bodyHi: string;
  bodyMid: string;
  bodyLo: string;
  belly: string;
  feetHi: string;
  feetLo: string;
  eyeWhite: string;
  pupil: string;
  zzz: string;
}

export interface MespOpts {
  family?: FamilyName;
  palette?: MespPalette;
  accessory?: Accessory;
  spots?: SpotPattern;
  spotColor?: string;
  eye?: EyeMode;
  feet?: FeetMode;
  walkPhase?: number;
  bodyDx?: number;
  bodyDy?: number;
  /** when true, skip drawing the pupil (useful for DOM-overlay pupils that follow the cursor) */
  noPupil?: boolean;
}

const PALETTE: MespPalette = {
  outline: '#162033',
  bodyHi: '#b6ecff',
  bodyMid: '#6fcfee',
  bodyLo: '#3a8fb8',
  belly: '#e7f7ff',
  feetHi: '#3a8fb8',
  feetLo: '#1f5f7d',
  eyeWhite: '#ffffff',
  pupil: '#162033',
  zzz: '#cdd6f4',
};

interface FamilyDef {
  hi: string;
  mid: string;
  lo: string;
  belly: string;
}

export const FAMILIES: Record<FamilyName, FamilyDef> = {
  sky: { hi: '#b6ecff', mid: '#6fcfee', lo: '#3a8fb8', belly: '#e7f7ff' },
  rose: { hi: '#ffd5e3', mid: '#f48ab2', lo: '#b94677', belly: '#ffeef4' },
  mint: { hi: '#cdf5d6', mid: '#7adf99', lo: '#3a9b62', belly: '#ecfaef' },
  lemon: { hi: '#fff5b8', mid: '#f3d966', lo: '#b69820', belly: '#fffae0' },
  lilac: { hi: '#e0d0ff', mid: '#b48aef', lo: '#6e3fb1', belly: '#f3eaff' },
  peach: { hi: '#ffd9c3', mid: '#f7a07b', lo: '#c45f3b', belly: '#fff0e6' },
  aqua: { hi: '#bff5ee', mid: '#62ddc8', lo: '#258b7c', belly: '#e6faf6' },
  coral: { hi: '#ffc6c0', mid: '#f57870', lo: '#b53a30', belly: '#ffe7e3' },
  lavender: { hi: '#e8d6f8', mid: '#c8a4e8', lo: '#7a4ba8', belly: '#f3eaff' },
  cream: { hi: '#fff4dd', mid: '#f0d8a8', lo: '#b88a44', belly: '#fffaef' },
  sage: { hi: '#dbe6c4', mid: '#a8c486', lo: '#5a7c2e', belly: '#eef3df' },
  ghost: { hi: '#f0f3ff', mid: '#cbd1e8', lo: '#6c7497', belly: '#f8faff' },
};

export const ACCESSORIES: Accessory[] = [
  'none',
  'horns',
  'ears',
  'antenna',
  'bow',
  'flower',
  'halo',
  'star',
];
export const SPOT_PATTERNS: SpotPattern[] = ['none', 'belly', 'patches', 'stripe', 'heart'];

export function paletteFor(name: FamilyName): MespPalette {
  const f = FAMILIES[name];
  return {
    ...PALETTE,
    bodyHi: f.hi,
    bodyMid: f.mid,
    bodyLo: f.lo,
    belly: f.belly,
    feetHi: f.lo,
    feetLo: '#222',
  };
}

export function familyAccent(name: FamilyName): string {
  return FAMILIES[name].mid;
}

export function familyGradient(name: FamilyName, alpha = 0.3): string {
  const f = FAMILIES[name];
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `linear-gradient(135deg, ${f.hi}${a} 0%, ${f.mid}${a} 100%)`;
}

// ---- anatomy ----
const W = 32;
const H = 32;
const A = {
  bodyCx: 16,
  bodyCy: 18,
  bodyRx: 11,
  bodyRy: 9.5,
  bodyN: 2.4,
  eyeCx: 16,
  eyeCy: 15,
  eyeRx: 4,
  eyeRy: 4,
  feetY: 27,
  leftFootX: 10,
  leftFootRx: 3.0,
  leftFootRy: 2.2,
  rightFootX: 22,
  rightFootRx: 3.0,
  rightFootRy: 2.2,
};

/** Anatomy constants exposed for external pupil overlays. */
export const MESP_GRID = { W, H } as const;
export const MESP_EYE = {
  cx: A.eyeCx,
  cy: A.eyeCy,
  rx: A.eyeRx,
  ry: A.eyeRy,
} as const;

type Grid = (string | null)[][];

function makeGrid(): Grid {
  return Array.from({ length: H }, () => new Array<string | null>(W).fill(null));
}

function setPx(g: Grid, x: number, y: number, c: string) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c;
}

function getPx(g: Grid, x: number, y: number): string | null {
  x = Math.round(x);
  y = Math.round(y);
  return x >= 0 && x < W && y >= 0 && y < H ? g[y][x] : null;
}

function fillEllipse(g: Grid, cx: number, cy: number, rx: number, ry: number, c: string) {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) setPx(g, x, y, c);
    }
  }
}

function fillSquircle(
  g: Grid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  c: string
) {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = Math.abs((x + 0.5 - cx) / rx);
      const ny = Math.abs((y + 0.5 - cy) / ry);
      if (Math.pow(nx, n) + Math.pow(ny, n) <= 1) setPx(g, x, y, c);
    }
  }
}

function fillHeart(g: Grid, cx: number, cy: number, size: number, c: string) {
  const half = Math.max(2, Math.floor(size / 2));
  for (let dy = 0; dy <= half; dy++) {
    const radiusFactor = 1 - dy / (half + 0.5);
    const w = Math.max(0, Math.round(half * radiusFactor));
    for (let dx = -w; dx <= w; dx++) {
      setPx(g, cx - half + dx, cy - 1 + dy - Math.floor(half / 2), c);
      setPx(g, cx + half + dx, cy - 1 + dy - Math.floor(half / 2), c);
    }
  }
  for (let dy = 0; dy <= size; dy++) {
    const w = Math.max(0, size - dy);
    for (let dx = -w; dx <= w; dx++) setPx(g, cx + dx, cy + dy - Math.floor(half / 2), c);
  }
}

function applyOutline(g: Grid, outline: string) {
  const tp: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = g[y][x];
      if (c === null || c === outline) continue;
      if (
        getPx(g, x - 1, y) === null ||
        getPx(g, x + 1, y) === null ||
        getPx(g, x, y - 1) === null ||
        getPx(g, x, y + 1) === null
      ) {
        tp.push([x, y]);
      }
    }
  }
  for (const [x, y] of tp) g[y][x] = outline;
}

function blit(dst: Grid, src: Grid) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (src[y][x] !== null) dst[y][x] = src[y][x];
    }
  }
}

function drawBody(g: Grid, p: MespPalette, dx: number, dy: number) {
  const cx = A.bodyCx + dx;
  const cy = A.bodyCy + dy;
  fillSquircle(g, cx, cy + 1, A.bodyRx, A.bodyRy, A.bodyN, p.bodyLo);
  fillSquircle(g, cx, cy, A.bodyRx, A.bodyRy, A.bodyN, p.bodyMid);
}

function drawTuft(g: Grid, p: MespPalette, dx: number, dy: number) {
  const cx = A.bodyCx + dx;
  const topY = Math.round(A.bodyCy + dy - A.bodyRy + 1);
  const mid = p.bodyMid;
  setPx(g, cx, topY - 4, mid);
  setPx(g, cx - 1, topY - 3, mid);
  setPx(g, cx, topY - 3, mid);
  setPx(g, cx + 1, topY - 3, mid);
  setPx(g, cx - 1, topY - 2, mid);
  setPx(g, cx, topY - 2, mid);
  setPx(g, cx + 1, topY - 2, mid);
  setPx(g, cx, topY - 1, mid);
}

function drawTuftHighlight(g: Grid, p: MespPalette, dx: number, dy: number) {
  const cx = A.bodyCx + dx;
  const topY = Math.round(A.bodyCy + dy - A.bodyRy + 1);
  setPx(g, cx, topY - 3, p.bodyHi);
}

function drawEye(g: Grid, p: MespPalette, cx: number, cy: number, mode: EyeMode, noPupil = false) {
  if (mode === 'blink') {
    setPx(g, cx - 3, cy - 1, p.outline);
    setPx(g, cx - 2, cy, p.outline);
    setPx(g, cx - 1, cy, p.outline);
    setPx(g, cx, cy, p.outline);
    setPx(g, cx + 1, cy, p.outline);
    setPx(g, cx + 2, cy, p.outline);
    setPx(g, cx + 3, cy - 1, p.outline);
    return;
  }
  if (mode === 'closed') {
    setPx(g, cx - 3, cy - 1, p.outline);
    setPx(g, cx - 2, cy, p.outline);
    setPx(g, cx - 1, cy + 1, p.outline);
    setPx(g, cx, cy + 1, p.outline);
    setPx(g, cx + 1, cy + 1, p.outline);
    setPx(g, cx + 2, cy, p.outline);
    setPx(g, cx + 3, cy - 1, p.outline);
    return;
  }
  if (mode === 'confused') {
    setPx(g, cx - 3, cy + 1, p.outline);
    setPx(g, cx - 2, cy, p.outline);
    setPx(g, cx - 1, cy - 1, p.outline);
    setPx(g, cx, cy - 1, p.outline);
    setPx(g, cx + 1, cy - 1, p.outline);
    setPx(g, cx + 2, cy, p.outline);
    setPx(g, cx + 3, cy + 1, p.outline);
    return;
  }
  fillEllipse(g, cx, cy, A.eyeRx, A.eyeRy, p.eyeWhite);
  setPx(g, cx - 2, cy - 1, p.eyeWhite);
  if (mode === 'sparkle') setPx(g, cx + 2, cy + 1, p.eyeWhite);
  if (!noPupil) setPx(g, cx, cy, p.pupil);
}

function drawFeet(g: Grid, p: MespPalette, mode: FeetMode, walkPhase: number) {
  const y = A.feetY;
  if (mode === 'jump') {
    fillEllipse(g, A.leftFootX - 1, y - 5, A.leftFootRx, A.leftFootRy, p.feetHi);
    fillEllipse(g, A.rightFootX + 1, y - 5, A.rightFootRx, A.rightFootRy, p.feetHi);
    return;
  }
  if (mode === 'sit') {
    fillEllipse(g, A.leftFootX + 1, y, A.leftFootRx - 0.5, A.leftFootRy, p.feetLo);
    fillEllipse(g, A.rightFootX - 1, y, A.rightFootRx - 0.5, A.rightFootRy, p.feetLo);
    return;
  }
  if (walkPhase > 0) {
    const sin = Math.sin(walkPhase * Math.PI * 2);
    fillEllipse(
      g,
      A.leftFootX + sin * 1.5,
      y - Math.max(0, sin) * 2,
      A.leftFootRx,
      A.leftFootRy,
      p.feetHi
    );
    fillEllipse(
      g,
      A.rightFootX - sin * 1.5,
      y - Math.max(0, -sin) * 2,
      A.rightFootRx,
      A.rightFootRy,
      p.feetHi
    );
    return;
  }
  fillEllipse(g, A.leftFootX, y, A.leftFootRx, A.leftFootRy, p.feetHi);
  fillEllipse(g, A.rightFootX, y, A.rightFootRx, A.rightFootRy, p.feetHi);
}

function drawAccessoryBack(g: Grid, _p: MespPalette, acc: Accessory, dx: number, dy: number) {
  const topY = A.bodyCy + dy - A.bodyRy;
  if (acc === 'halo') {
    const cx = A.bodyCx + dx;
    const hy = topY - 4;
    for (let x = -5; x <= 5; x++) {
      if (Math.abs(x) <= 4) setPx(g, cx + x, hy, '#fff3a3');
      if (Math.abs(x) <= 5 && Math.abs(x) > 1) setPx(g, cx + x, hy + 1, '#e3b427');
    }
  }
  if (acc === 'star') {
    const cx = A.bodyCx + dx;
    const sy = topY - 5;
    setPx(g, cx, sy, '#ffd84a');
    setPx(g, cx - 1, sy + 1, '#ffd84a');
    setPx(g, cx, sy + 1, '#fff3a3');
    setPx(g, cx + 1, sy + 1, '#ffd84a');
    setPx(g, cx, sy + 2, '#ffd84a');
    setPx(g, cx - 2, sy + 1, '#ffd84a');
    setPx(g, cx + 2, sy + 1, '#ffd84a');
  }
}

function drawAccessoryFront(g: Grid, p: MespPalette, acc: Accessory, dx: number, dy: number) {
  const topY = A.bodyCy + dy - A.bodyRy;
  if (acc === 'horns') {
    const drawHorn = (x: number) => {
      setPx(g, x, topY, '#f4d97a');
      setPx(g, x + 1, topY, '#f4d97a');
      setPx(g, x, topY - 1, '#f4d97a');
      setPx(g, x, topY - 2, '#9d7522');
      setPx(g, x + 1, topY - 1, '#9d7522');
    };
    drawHorn(A.bodyCx - 6 + dx);
    drawHorn(A.bodyCx + 4 + dx);
  }
  if (acc === 'ears') {
    const drawEar = (cx: number) => {
      const ear = makeGrid();
      fillEllipse(ear, cx, topY - 1, 2.4, 3, p.bodyMid);
      setPx(ear, cx, topY + 1, p.bodyLo);
      fillEllipse(ear, cx, topY - 1, 1.0, 1.7, '#ffc1d4');
      setPx(ear, cx, topY - 3, p.bodyHi);
      applyOutline(ear, p.outline);
      blit(g, ear);
    };
    drawEar(A.bodyCx - 7 + dx);
    drawEar(A.bodyCx + 7 + dx);
  }
  if (acc === 'antenna') {
    const cx = A.bodyCx + dx;
    setPx(g, cx, topY, p.outline);
    setPx(g, cx, topY - 1, p.outline);
    setPx(g, cx, topY - 2, p.outline);
    fillEllipse(g, cx, topY - 4, 1.5, 1.5, '#ffd84a');
    setPx(g, cx - 1, topY - 5, '#fff3a3');
  }
  if (acc === 'bow') {
    const cx = A.bodyCx + 4 + dx;
    const cy = topY;
    setPx(g, cx - 2, cy - 1, '#ffb1cf');
    setPx(g, cx - 2, cy, '#ffb1cf');
    setPx(g, cx - 1, cy, '#ffb1cf');
    setPx(g, cx - 2, cy + 1, '#cf3f6e');
    setPx(g, cx + 2, cy - 1, '#ffb1cf');
    setPx(g, cx + 2, cy, '#ffb1cf');
    setPx(g, cx + 1, cy, '#ffb1cf');
    setPx(g, cx + 2, cy + 1, '#cf3f6e');
    setPx(g, cx, cy, '#ffe4ee');
    setPx(g, cx, cy + 1, '#cf3f6e');
  }
  if (acc === 'flower') {
    const cx = A.bodyCx - 5 + dx;
    const cy = topY + 1;
    setPx(g, cx, cy - 1, '#ffffff');
    setPx(g, cx, cy + 1, '#ffffff');
    setPx(g, cx - 1, cy, '#ffffff');
    setPx(g, cx + 1, cy, '#ffffff');
    setPx(g, cx + 1, cy - 1, '#ffffff');
    setPx(g, cx - 1, cy + 1, '#ffffff');
    setPx(g, cx, cy, '#ffd84a');
  }
}

function drawSpots(
  g: Grid,
  p: MespPalette,
  pattern: SpotPattern,
  color: string,
  dx: number,
  dy: number
) {
  const cx = A.bodyCx + dx;
  const cy = A.bodyCy + dy;
  if (pattern === 'belly') {
    fillEllipse(g, cx, cy + 3, 4, 3.5, color);
    fillEllipse(g, cx, cy + 2, 3.5, 2.5, p.belly);
  }
  if (pattern === 'patches') {
    fillEllipse(g, cx - 5, cy - 4, 1.5, 1.2, color);
    fillEllipse(g, cx + 4, cy + 1, 2, 1.5, color);
    fillEllipse(g, cx - 2, cy + 4, 1.5, 1.2, color);
  }
  if (pattern === 'stripe') {
    for (let x = cx - 8; x <= cx + 8; x++) {
      setPx(g, x, cy + 4, color);
      setPx(g, x, cy + 5, color);
    }
  }
  if (pattern === 'heart') {
    fillHeart(g, cx, cy + 4, 3, color);
  }
}

export function compose(opts: MespOpts = {}): Grid {
  const p = opts.palette || (opts.family ? paletteFor(opts.family) : PALETTE);
  const dx = opts.bodyDx || 0;
  const dy = opts.bodyDy || 0;
  const out = makeGrid();

  if (opts.accessory && opts.accessory !== 'none') drawAccessoryBack(out, p, opts.accessory, dx, dy);

  const bodyG = makeGrid();
  drawBody(bodyG, p, dx, dy);
  drawTuft(bodyG, p, dx, dy);
  applyOutline(bodyG, p.outline);
  blit(out, bodyG);
  drawTuftHighlight(out, p, dx, dy);

  if (opts.spots && opts.spots !== 'none')
    drawSpots(out, p, opts.spots, opts.spotColor || '#ffffff', dx, dy);

  drawEye(out, p, A.eyeCx + dx, A.eyeCy + dy, opts.eye || 'open', opts.noPupil);

  if (opts.accessory && opts.accessory !== 'none')
    drawAccessoryFront(out, p, opts.accessory, dx, dy);

  const feetG = makeGrid();
  drawFeet(feetG, p, opts.feet || 'normal', opts.walkPhase || 0);
  applyOutline(feetG, p.outline);
  blit(out, feetG);

  return out;
}

export function renderMesp(canvas: HTMLCanvasElement, opts: MespOpts = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cw = canvas.width;
  const ch = canvas.height;
  const grid = compose(opts);
  ctx.clearRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = false;
  const scaleX = cw / W;
  const scaleY = ch / H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = grid[y][x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(
        Math.floor(x * scaleX),
        Math.floor(y * scaleY),
        Math.ceil(scaleX),
        Math.ceil(scaleY)
      );
    }
  }
}

export interface RandomTraits {
  family: FamilyName;
  accessory: Accessory;
  spots: SpotPattern;
  eye: EyeMode;
  spotColor: string;
}

function pickWeighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of items) {
    if ((r -= w) < 0) return v;
  }
  return items[0][0];
}

export function randomTraits(seed?: Partial<RandomTraits>): RandomTraits {
  const familyNames = Object.keys(FAMILIES) as FamilyName[];
  const family = seed?.family || familyNames[Math.floor(Math.random() * familyNames.length)];
  const accessory =
    seed?.accessory ||
    pickWeighted<Accessory>([
      ['none', 3],
      ['horns', 1.5],
      ['ears', 1.8],
      ['antenna', 1.3],
      ['bow', 1.5],
      ['flower', 1.4],
      ['halo', 1],
      ['star', 1.2],
    ]);
  const spots =
    seed?.spots ||
    pickWeighted<SpotPattern>([
      ['none', 4],
      ['belly', 1.5],
      ['patches', 1.5],
      ['stripe', 1],
      ['heart', 1.2],
    ]);
  const eye =
    seed?.eye ||
    pickWeighted<EyeMode>([
      ['open', 8],
      ['sparkle', 4],
      ['blink', 1.5],
    ]);

  return {
    family,
    accessory,
    spots,
    eye,
    spotColor: seed?.spotColor || '#ffffff',
  };
}
