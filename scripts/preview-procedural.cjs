/* eslint-disable */
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const PALETTE = {
  outline:  '#0d1f2d',
  bodyHi:   '#9fe1f7',
  bodyMid:  '#5fc3eb',
  bodyLo:   '#2e8fc1',
  feetHi:   '#3fa3d4',
  feetLo:   '#246b94',
  eyeWhite: '#ffffff',
  blush:    '#ff9eaf',
};
const SPRITE_W = 32, SPRITE_H = 32;
const A = {
  bodyCx: 16, bodyCy: 17, bodyRx: 12, bodyRy: 9, bodyN: 2.0,
  eyeCx: 11, eyeCy: 16, eyeRx: 3.4, eyeRy: 3.6,
  feetY: 28,
  leftFootX: 9, leftFootRx: 3.5, leftFootRy: 2.2,
  rightFootX: 23, rightFootRx: 3.0, rightFootRy: 2.0,
  tuftBaseY: 7,
};

function makeGrid() { return Array.from({length: SPRITE_H}, () => new Array(SPRITE_W).fill(null)); }
function setPx(g, x, y, c) { if (y>=0&&y<SPRITE_H&&x>=0&&x<SPRITE_W) g[y][x]=c; }
function getPx(g, x, y) { return (y>=0&&y<SPRITE_H&&x>=0&&x<SPRITE_W) ? g[y][x] : null; }
function fillRect(g, x, y, w, h, c) {
  for (let dy=0; dy<h; dy++) for (let dx=0; dx<w; dx++) setPx(g, x+dx, y+dy, c);
}
function fillEllipse(g, cx, cy, rx, ry, c) {
  const x0 = Math.floor(cx-rx), x1 = Math.ceil(cx+rx);
  const y0 = Math.floor(cy-ry), y1 = Math.ceil(cy+ry);
  for (let y=y0; y<=y1; y++) for (let x=x0; x<=x1; x++) {
    const nx = (x+0.5-cx)/rx, ny = (y+0.5-cy)/ry;
    if (nx*nx+ny*ny <= 1) setPx(g, x, y, c);
  }
}
function fillSquircle(g, cx, cy, rx, ry, n, c) {
  const x0 = Math.floor(cx-rx), x1 = Math.ceil(cx+rx);
  const y0 = Math.floor(cy-ry), y1 = Math.ceil(cy+ry);
  for (let y=y0; y<=y1; y++) for (let x=x0; x<=x1; x++) {
    const nx = Math.abs((x+0.5-cx)/rx);
    const ny = Math.abs((y+0.5-cy)/ry);
    if (Math.pow(nx, n) + Math.pow(ny, n) <= 1) setPx(g, x, y, c);
  }
}
function applyOutline(g, c) {
  const tp = [];
  for (let y=0; y<SPRITE_H; y++) for (let x=0; x<SPRITE_W; x++) {
    if (g[y][x] === null) continue;
    if (getPx(g,x-1,y)===null||getPx(g,x+1,y)===null||getPx(g,x,y-1)===null||getPx(g,x,y+1)===null) tp.push([x,y]);
  }
  for (const [x,y] of tp) g[y][x] = c;
}

function drawTriangleSpike(g, baseX, baseY, tipX, tipY, width, color) {
  const dx = tipX - baseX, dy = tipY - baseY;
  const length = Math.max(1, Math.abs(dy));
  for (let i=0; i<=length; i++) {
    const t = i / length;
    const cx = Math.round(baseX + dx*t);
    const cy = Math.round(baseY + dy*t);
    const w = Math.max(1, Math.round(width * (1 - t)));
    const xStart = cx - Math.floor(w/2);
    for (let dxi=0; dxi<w; dxi++) setPx(g, xStart+dxi, cy, color);
  }
}

function drawTuft(g, dy=0) {
  const topY = A.bodyCy + dy - A.bodyRy + 1;
  const xs = [13, 16, 19];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const height = i === 1 ? 3 : 2;
    for (let y = 0; y < height; y++) setPx(g, x, topY - y, PALETTE.bodyMid);
    setPx(g, x, topY - height, PALETTE.bodyHi);
  }
}

function drawEye(g, mode='open', dy=0, shiftX=0) {
  const cx = A.eyeCx + shiftX, cy = A.eyeCy + dy;
  if (mode === 'blink') { fillRect(g, cx-3, cy+1, 7, 1, PALETTE.outline); return; }
  if (mode === 'closed') {
    setPx(g, cx-3, cy, PALETTE.outline);
    for (let i=-2; i<=2; i++) setPx(g, cx+i, cy+1, PALETTE.outline);
    setPx(g, cx+3, cy, PALETTE.outline);
    return;
  }
  fillEllipse(g, cx, cy, A.eyeRx, A.eyeRy, PALETTE.eyeWhite);
}

function drawFeet(g, mode='normal', walk=0) {
  const y = A.feetY;
  if (walk > 0) {
    const sin = Math.sin(walk * Math.PI * 2);
    fillEllipse(g, A.leftFootX + sin*1.5, y - Math.max(0,sin)*2, A.leftFootRx, A.leftFootRy, PALETTE.feetHi);
    fillEllipse(g, A.rightFootX - sin*1.5, y - Math.max(0,-sin)*2, A.rightFootRx, A.rightFootRy, PALETTE.feetHi);
    return;
  }
  fillEllipse(g, A.leftFootX, y, A.leftFootRx, A.leftFootRy, PALETTE.feetHi);
  fillEllipse(g, A.rightFootX, y, A.rightFootRx, A.rightFootRy, PALETTE.feetHi);
}

function compose(opts={}) {
  const g = makeGrid();
  const dy = opts.bodyDy || 0;
  drawTuft(g, dy);
  fillSquircle(g, A.bodyCx, A.bodyCy+dy+2, A.bodyRx, A.bodyRy, A.bodyN, PALETTE.bodyLo);
  fillSquircle(g, A.bodyCx, A.bodyCy+dy, A.bodyRx, A.bodyRy, A.bodyN, PALETTE.bodyMid);
  fillSquircle(g, A.bodyCx-2, A.bodyCy+dy-4, A.bodyRx-4, A.bodyRy-6, A.bodyN, PALETTE.bodyHi);
  applyOutline(g, PALETTE.outline);
  // shift do olho: 'center' desloca pra bodyCx
  const shiftX = opts.eyePos === 'center' ? (A.bodyCx - A.eyeCx) : 0;
  drawEye(g, opts.eye || 'open', dy, shiftX);
  // blush
  if (opts.blush !== false) {
    setPx(g, A.bodyCx + 6, A.bodyCy + dy + 1, PALETTE.blush);
    setPx(g, A.bodyCx + 7, A.bodyCy + dy + 1, PALETTE.blush);
    setPx(g, A.bodyCx + 6, A.bodyCy + dy + 2, PALETTE.blush);
  }
  // Pés em grid separado
  const feetGrid = makeGrid();
  drawFeet(feetGrid, opts.feet || 'normal', opts.walkPhase || 0);
  applyOutline(feetGrid, PALETTE.outline);
  for (let y=0; y<SPRITE_H; y++) for (let x=0; x<SPRITE_W; x++) {
    if (feetGrid[y][x] !== null) g[y][x] = feetGrid[y][x];
  }
  return g;
}

function gridToPng(grid, scale = 8) {
  const w = SPRITE_W * scale, h = SPRITE_H * scale;
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i++) png.data[i] = 0;
  for (let ly = 0; ly < SPRITE_H; ly++) {
    for (let lx = 0; lx < SPRITE_W; lx++) {
      const c = grid[ly][lx];
      if (!c) continue;
      const hex = c.startsWith('#') ? c.slice(1) : c;
      const r = parseInt(hex.slice(0,2), 16);
      const g = parseInt(hex.slice(2,4), 16);
      const b = parseInt(hex.slice(4,6), 16);
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const px = lx*scale+dx, py = ly*scale+dy;
        const idx = (py*w + px)*4;
        png.data[idx] = r; png.data[idx+1] = g; png.data[idx+2] = b; png.data[idx+3] = 255;
      }
    }
  }
  return PNG.sync.write(png);
}

const outDir = path.join(__dirname, 'preview');
fs.mkdirSync(outDir, { recursive: true });

const samples = [
  { name: 'idle',       opts: { eyePos: 'center' } },
  { name: 'blink',      opts: { eye: 'blink', eyePos: 'center' } },
  { name: 'sleep',      opts: { eye: 'closed', eyePos: 'center' } },
  { name: 'walking_0',  opts: { walkPhase: 0.0,  eyePos: 'left' } },
  { name: 'walking_1',  opts: { walkPhase: 0.25, eyePos: 'left' } },
  { name: 'walking_2',  opts: { walkPhase: 0.5,  eyePos: 'left' } },
  { name: 'walking_3',  opts: { walkPhase: 0.75, eyePos: 'left' } },
];

for (const s of samples) {
  const grid = compose(s.opts);
  fs.writeFileSync(path.join(outDir, s.name + '.png'), gridToPng(grid, 8));
  console.log('  ' + s.name + '.png');
}
console.log('Pronto.');
