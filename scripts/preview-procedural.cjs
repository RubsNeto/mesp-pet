// scripts/preview-procedural.cjs
//
// Gera PNGs de prévia do MESP renderizado proceduralmente, sem precisar abrir
// o app. Replica em CJS a lógica de src/procedural/* para uso offline.
// Usa pngjs para escrever PNGs em disco.
//
// Uso:
//   node scripts/preview-procedural.cjs
//   (saída em scripts/preview/*.png)

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

// ---------------- Paleta padrão (sky family) -------------------------------

const PALETTE = {
  outline:  '#162033',
  bodyHi:   '#b6ecff',
  bodyMid:  '#6fcfee',
  bodyLo:   '#3a8fb8',
  belly:    '#e7f7ff',
  feetHi:   '#3a8fb8',
  feetLo:   '#1f5f7d',
  eyeWhite: '#ffffff',
  pupil:    '#162033',
  zzz:      '#cdd6f4',
};

// ---------------- Anatomia (32x32) -----------------------------------------

const W = 32, H = 32;
const A = {
  bodyCx: 16, bodyCy: 18, bodyRx: 11, bodyRy: 9.5, bodyN: 2.4,
  eyeCx: 16, eyeCy: 15, eyeRx: 4, eyeRy: 4,
  feetY: 27, leftFootX: 10, leftFootRx: 3.0, leftFootRy: 2.2,
  rightFootX: 22, rightFootRx: 3.0, rightFootRy: 2.2,
};

// ---------------- Primitivas -----------------------------------------------

function makeGrid() { return Array.from({length: H}, () => new Array(W).fill(null)); }
function setPx(g, x, y, c) { x = Math.round(x); y = Math.round(y); if (x>=0&&x<W&&y>=0&&y<H) g[y][x] = c; }
function getPx(g, x, y) { x = Math.round(x); y = Math.round(y); return (x>=0&&x<W&&y>=0&&y<H) ? g[y][x] : null; }

function fillEllipse(g, cx, cy, rx, ry, c) {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx*nx + ny*ny <= 1) setPx(g, x, y, c);
  }
}
function fillSquircle(g, cx, cy, rx, ry, n, c) {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const nx = Math.abs((x + 0.5 - cx) / rx);
    const ny = Math.abs((y + 0.5 - cy) / ry);
    if (Math.pow(nx, n) + Math.pow(ny, n) <= 1) setPx(g, x, y, c);
  }
}
function fillHeart(g, cx, cy, size, c) {
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
function applyOutline(g, outline) {
  const tp = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = g[y][x];
    if (c === null || c === outline) continue;
    if (getPx(g,x-1,y)===null||getPx(g,x+1,y)===null||getPx(g,x,y-1)===null||getPx(g,x,y+1)===null) tp.push([x,y]);
  }
  for (const [x,y] of tp) g[y][x] = outline;
}
function blit(dst, src) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (src[y][x] !== null) dst[y][x] = src[y][x];
  }
}

// ---------------- Partes do MESP -------------------------------------------

function drawBody(g, p, dx=0, dy=0) {
  const cx = A.bodyCx + dx, cy = A.bodyCy + dy;
  fillSquircle(g, cx, cy + 1, A.bodyRx, A.bodyRy, A.bodyN, p.bodyLo);
  fillSquircle(g, cx, cy, A.bodyRx, A.bodyRy, A.bodyN, p.bodyMid);
}

function drawTuft(g, p, dx=0, dy=0) {
  const cx = A.bodyCx + dx;
  const topY = Math.round(A.bodyCy + dy - A.bodyRy + 1);
  const mid = p.bodyMid;
  setPx(g, cx,     topY - 4, mid);
  setPx(g, cx - 1, topY - 3, mid);
  setPx(g, cx,     topY - 3, mid);
  setPx(g, cx + 1, topY - 3, mid);
  setPx(g, cx - 1, topY - 2, mid);
  setPx(g, cx,     topY - 2, mid);
  setPx(g, cx + 1, topY - 2, mid);
  setPx(g, cx,     topY - 1, mid);
}

function drawTuftHighlight(g, p, dx=0, dy=0) {
  const cx = A.bodyCx + dx;
  const topY = Math.round(A.bodyCy + dy - A.bodyRy + 1);
  setPx(g, cx, topY - 3, p.bodyHi);
}

function drawEye(g, p, cx, cy, mode) {
  if (mode === 'blink') {
    setPx(g, cx-3, cy-1, p.outline);
    setPx(g, cx-2, cy, p.outline); setPx(g, cx-1, cy, p.outline); setPx(g, cx, cy, p.outline);
    setPx(g, cx+1, cy, p.outline); setPx(g, cx+2, cy, p.outline);
    setPx(g, cx+3, cy-1, p.outline);
    return;
  }
  if (mode === 'closed') {
    setPx(g, cx-3, cy-1, p.outline);
    setPx(g, cx-2, cy, p.outline);
    setPx(g, cx-1, cy+1, p.outline); setPx(g, cx, cy+1, p.outline); setPx(g, cx+1, cy+1, p.outline);
    setPx(g, cx+2, cy, p.outline);
    setPx(g, cx+3, cy-1, p.outline);
    return;
  }
  if (mode === 'confused') {
    setPx(g, cx-3, cy+1, p.outline);
    setPx(g, cx-2, cy, p.outline);
    setPx(g, cx-1, cy-1, p.outline); setPx(g, cx, cy-1, p.outline); setPx(g, cx+1, cy-1, p.outline);
    setPx(g, cx+2, cy, p.outline);
    setPx(g, cx+3, cy+1, p.outline);
    return;
  }
  fillEllipse(g, cx, cy, A.eyeRx, A.eyeRy, p.eyeWhite);
  setPx(g, cx-2, cy-1, p.eyeWhite);
  if (mode === 'sparkle') setPx(g, cx+2, cy+1, p.eyeWhite);
  setPx(g, cx, cy, p.pupil);
}

function drawSweatDrop(g, p, dx=0, dy=0) {
  const cx = A.eyeCx + A.eyeRx + 3 + dx, cy = A.eyeCy - 2 + dy;
  setPx(g, cx, cy, '#9be3ff'); setPx(g, cx, cy+1, '#7fd4f5'); setPx(g, cx, cy+2, p.outline); setPx(g, cx+1, cy+1, '#7fd4f5');
}

function drawFeet(g, p, mode='normal', walkPhase=0) {
  const y = A.feetY;
  if (mode === 'jump') {
    fillEllipse(g, A.leftFootX - 1, y - 5, A.leftFootRx, A.leftFootRy, p.feetHi);
    fillEllipse(g, A.rightFootX + 1, y - 5, A.rightFootRx, A.rightFootRy, p.feetHi); return;
  }
  if (mode === 'fall') {
    fillEllipse(g, A.leftFootX, y + 1, A.leftFootRx + 0.5, A.leftFootRy + 0.5, p.feetHi);
    fillEllipse(g, A.rightFootX, y + 1, A.rightFootRx + 0.5, A.rightFootRy + 0.5, p.feetHi); return;
  }
  if (mode === 'sit') {
    fillEllipse(g, A.leftFootX + 1, y, A.leftFootRx - 0.5, A.leftFootRy, p.feetLo);
    fillEllipse(g, A.rightFootX - 1, y, A.rightFootRx - 0.5, A.rightFootRy, p.feetLo); return;
  }
  if (mode === 'crouch') {
    fillEllipse(g, A.leftFootX + 1, y - 1, A.leftFootRx, A.leftFootRy, p.feetHi);
    fillEllipse(g, A.rightFootX - 1, y - 1, A.rightFootRx, A.rightFootRy, p.feetHi); return;
  }
  if (walkPhase > 0) {
    const sin = Math.sin(walkPhase * Math.PI * 2);
    fillEllipse(g, A.leftFootX + sin*1.5, y - Math.max(0,sin)*2, A.leftFootRx, A.leftFootRy, p.feetHi);
    fillEllipse(g, A.rightFootX - sin*1.5, y - Math.max(0,-sin)*2, A.rightFootRx, A.rightFootRy, p.feetHi); return;
  }
  fillEllipse(g, A.leftFootX, y, A.leftFootRx, A.leftFootRy, p.feetHi);
  fillEllipse(g, A.rightFootX, y, A.rightFootRx, A.rightFootRy, p.feetHi);
}

// ---------------- Acessórios -----------------------------------------------

function drawAccessoryBack(g, p, acc, dx=0, dy=0) {
  const topY = A.bodyCy + dy - A.bodyRy;
  if (acc === 'halo') {
    const cx = A.bodyCx + dx, hy = topY - 4;
    for (let x = -5; x <= 5; x++) {
      if (Math.abs(x) <= 4) setPx(g, cx+x, hy, '#fff3a3');
      if (Math.abs(x) <= 5 && Math.abs(x) > 1) setPx(g, cx+x, hy+1, '#e3b427');
    }
  }
  if (acc === 'star') {
    const cx = A.bodyCx + dx, sy = topY - 5;
    setPx(g, cx, sy, '#ffd84a');
    setPx(g, cx-1, sy+1, '#ffd84a'); setPx(g, cx, sy+1, '#fff3a3'); setPx(g, cx+1, sy+1, '#ffd84a');
    setPx(g, cx, sy+2, '#ffd84a'); setPx(g, cx-2, sy+1, '#ffd84a'); setPx(g, cx+2, sy+1, '#ffd84a');
  }
}

function drawAccessoryFront(g, p, acc, dx=0, dy=0) {
  const topY = A.bodyCy + dy - A.bodyRy;
  if (acc === 'horns') {
    const drawHorn = (x) => {
      setPx(g, x, topY, '#f4d97a'); setPx(g, x+1, topY, '#f4d97a');
      setPx(g, x, topY-1, '#f4d97a'); setPx(g, x, topY-2, '#9d7522'); setPx(g, x+1, topY-1, '#9d7522');
    };
    drawHorn(A.bodyCx - 6 + dx); drawHorn(A.bodyCx + 4 + dx);
  }
  if (acc === 'ears') {
    const drawEar = (cx) => {
      const ear = makeGrid();
      fillEllipse(ear, cx, topY - 1, 2.4, 3, p.bodyMid);
      setPx(ear, cx, topY + 1, p.bodyLo);
      fillEllipse(ear, cx, topY - 1, 1.0, 1.7, '#ffc1d4');
      setPx(ear, cx, topY - 3, p.bodyHi);
      applyOutline(ear, p.outline);
      blit(g, ear);
    };
    drawEar(A.bodyCx - 7 + dx); drawEar(A.bodyCx + 7 + dx);
  }
  if (acc === 'antenna') {
    const cx = A.bodyCx + dx;
    setPx(g, cx, topY, p.outline); setPx(g, cx, topY-1, p.outline); setPx(g, cx, topY-2, p.outline);
    fillEllipse(g, cx, topY-4, 1.5, 1.5, '#ffd84a');
    setPx(g, cx-1, topY-5, '#fff3a3');
  }
  if (acc === 'bow') {
    const cx = A.bodyCx + 4 + dx, cy = topY;
    setPx(g, cx-2, cy-1, '#ffb1cf'); setPx(g, cx-2, cy, '#ffb1cf'); setPx(g, cx-1, cy, '#ffb1cf'); setPx(g, cx-2, cy+1, '#cf3f6e');
    setPx(g, cx+2, cy-1, '#ffb1cf'); setPx(g, cx+2, cy, '#ffb1cf'); setPx(g, cx+1, cy, '#ffb1cf'); setPx(g, cx+2, cy+1, '#cf3f6e');
    setPx(g, cx, cy, '#ffe4ee'); setPx(g, cx, cy+1, '#cf3f6e');
  }
  if (acc === 'flower') {
    const cx = A.bodyCx - 5 + dx, cy = topY + 1;
    setPx(g, cx, cy-1, '#ffffff'); setPx(g, cx, cy+1, '#ffffff');
    setPx(g, cx-1, cy, '#ffffff'); setPx(g, cx+1, cy, '#ffffff');
    setPx(g, cx+1, cy-1, '#ffffff'); setPx(g, cx-1, cy+1, '#ffffff');
    setPx(g, cx, cy, '#ffd84a');
  }
}

// ---------------- Spots ----------------------------------------------------

function drawSpots(g, p, pattern, color, dx=0, dy=0) {
  const cx = A.bodyCx + dx, cy = A.bodyCy + dy;
  if (pattern === 'belly') {
    fillEllipse(g, cx, cy + 3, 4, 3.5, color);
    fillEllipse(g, cx, cy + 2, 3.5, 2.5, p.belly);
  }
  if (pattern === 'patches') {
    fillEllipse(g, cx-5, cy-4, 1.5, 1.2, color);
    fillEllipse(g, cx+4, cy+1, 2, 1.5, color);
    fillEllipse(g, cx-2, cy+4, 1.5, 1.2, color);
  }
  if (pattern === 'stripe') {
    for (let x = cx - 8; x <= cx + 8; x++) { setPx(g, x, cy+4, color); setPx(g, x, cy+5, color); }
  }
  if (pattern === 'heart') fillHeart(g, cx, cy + 4, 3, color);
}

// ---------------- Compose --------------------------------------------------

function compose(opts={}) {
  const p = opts.palette || PALETTE;
  const dx = opts.bodyDx || 0, dy = opts.bodyDy || 0;
  const out = makeGrid();

  if (opts.accessory) drawAccessoryBack(out, p, opts.accessory, dx, dy);

  // Body + tufo no mesmo grid, antes do outline (tufo precisa do contexto
  // do corpo para ter pixels internos preservados pelo applyOutline).
  const bodyG = makeGrid();
  drawBody(bodyG, p, dx, dy);
  drawTuft(bodyG, p, dx, dy);
  applyOutline(bodyG, p.outline);
  blit(out, bodyG);
  drawTuftHighlight(out, p, dx, dy);

  if (opts.spots) drawSpots(out, p, opts.spots, opts.spotColor || '#ffffff', dx, dy);

  drawEye(out, p, A.eyeCx + dx, A.eyeCy + dy, opts.eye || 'open');

  if (opts.accessory) drawAccessoryFront(out, p, opts.accessory, dx, dy);

  const feetG = makeGrid();
  drawFeet(feetG, p, opts.feet || 'normal', opts.walkPhase || 0);
  applyOutline(feetG, p.outline);
  blit(out, feetG);

  if (opts.sweatDrop) drawSweatDrop(out, p, dx, dy);
  return out;
}

// ---------------- Render PNG -----------------------------------------------

function gridToPng(grid, scale=8) {
  const w = W * scale, h = H * scale;
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i++) png.data[i] = 0;
  for (let ly = 0; ly < H; ly++) for (let lx = 0; lx < W; lx++) {
    const c = grid[ly][lx];
    if (!c) continue;
    const hex = c.startsWith('#') ? c.slice(1) : c;
    const r = parseInt(hex.slice(0,2), 16), g = parseInt(hex.slice(2,4), 16), b = parseInt(hex.slice(4,6), 16);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const idx = ((ly*scale+dy)*w + (lx*scale+dx)) * 4;
      png.data[idx] = r; png.data[idx+1] = g; png.data[idx+2] = b; png.data[idx+3] = 255;
    }
  }
  return PNG.sync.write(png);
}

// ---------------- Main -----------------------------------------------------

const FAMILIES = {
  sky:    { hi: '#b6ecff', mid: '#6fcfee', lo: '#3a8fb8', belly: '#e7f7ff' },
  rose:   { hi: '#ffd5e3', mid: '#f48ab2', lo: '#b94677', belly: '#ffeef4' },
  mint:   { hi: '#cdf5d6', mid: '#7adf99', lo: '#3a9b62', belly: '#ecfaef' },
  lemon:  { hi: '#fff5b8', mid: '#f3d966', lo: '#b69820', belly: '#fffae0' },
  lilac:  { hi: '#e0d0ff', mid: '#b48aef', lo: '#6e3fb1', belly: '#f3eaff' },
  peach:  { hi: '#ffd9c3', mid: '#f7a07b', lo: '#c45f3b', belly: '#fff0e6' },
  aqua:   { hi: '#bff5ee', mid: '#62ddc8', lo: '#258b7c', belly: '#e6faf6' },
  coral:  { hi: '#ffc6c0', mid: '#f57870', lo: '#b53a30', belly: '#ffe7e3' },
};

function paletteFor(name) {
  const f = FAMILIES[name];
  if (!f) return PALETTE;
  return { ...PALETTE, bodyHi: f.hi, bodyMid: f.mid, bodyLo: f.lo, belly: f.belly, feetHi: f.lo, feetLo: '#222' };
}

const outDir = path.join(__dirname, 'preview');
fs.mkdirSync(outDir, { recursive: true });

// Estados básicos do MESP padrão
const baseSamples = [
  { name: 'idle',         opts: { eye: 'open' } },
  { name: 'blink',        opts: { eye: 'blink' } },
  { name: 'sparkle',      opts: { eye: 'sparkle' } },
  { name: 'sleep',        opts: { eye: 'closed', feet: 'sit' } },
  { name: 'jump',         opts: { eye: 'sparkle', feet: 'jump', bodyDy: -1 } },
  { name: 'fall',         opts: { eye: 'open', feet: 'fall', bodyDy: 1 } },
  { name: 'confused',     opts: { eye: 'confused', feet: 'crouch', sweatDrop: true } },
  { name: 'sit',          opts: { eye: 'open', feet: 'sit' } },
  { name: 'walking_0',    opts: { walkPhase: 0.0  } },
  { name: 'walking_1',    opts: { walkPhase: 0.25 } },
  { name: 'walking_2',    opts: { walkPhase: 0.5  } },
  { name: 'walking_3',    opts: { walkPhase: 0.75 } },
];
for (const s of baseSamples) {
  fs.writeFileSync(path.join(outDir, s.name + '.png'), gridToPng(compose(s.opts), 8));
}

// Variações de cor + acessório (galeria de exemplos)
const variants = [
  { name: 'var_sky_plain',     opts: { palette: paletteFor('sky') } },
  { name: 'var_rose_bow',      opts: { palette: paletteFor('rose'),  accessory: 'bow' } },
  { name: 'var_mint_ears',     opts: { palette: paletteFor('mint'),  accessory: 'ears' } },
  { name: 'var_lemon_horns',   opts: { palette: paletteFor('lemon'), accessory: 'horns' } },
  { name: 'var_lilac_halo',    opts: { palette: paletteFor('lilac'), accessory: 'halo' } },
  { name: 'var_peach_flower',  opts: { palette: paletteFor('peach'), accessory: 'flower', spots: 'belly' } },
  { name: 'var_aqua_antenna',  opts: { palette: paletteFor('aqua'),  accessory: 'antenna', spots: 'patches', spotColor: '#ffffff' } },
  { name: 'var_coral_star',    opts: { palette: paletteFor('coral'), accessory: 'star',   spots: 'heart',   spotColor: '#ffffff' } },
  { name: 'var_sky_belly',     opts: { palette: paletteFor('sky'),   spots: 'belly' } },
  { name: 'var_mint_stripe',   opts: { palette: paletteFor('mint'),  spots: 'stripe', spotColor: '#3b3550' } },
];
for (const v of variants) {
  fs.writeFileSync(path.join(outDir, v.name + '.png'), gridToPng(compose(v.opts), 8));
}

console.log('Previews gerados em', outDir);
console.log('  Estados:', baseSamples.length, 'PNGs');
console.log('  Variantes:', variants.length, 'PNGs');
