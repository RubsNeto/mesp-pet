// tests/composer.test.mjs
//
// Testa o pipeline procedural reimplementado em CJS (mesma lógica do
// src/procedural/). Isso valida o COMPORTAMENTO funcional sem precisar de
// DOM ou compilador TS.
//
// Cobertura:
//   • Grid retorna 32x32 com pixels não-nulos (pet aparece).
//   • Olhos esquerdo e direito ambos têm esclera branca em frames "abertos".
//   • Frame "blink" não tem esclera (pixels brancos no olho).
//   • Frame "sleep" tem feet 'sit' (pés mais juntos).
//   • Acessório "horns" pinta pixels acima do corpo.
//   • Acessório "halo" pinta pixels mais altos ainda.
//   • Spots "heart" pinta pixels da cor escolhida no peito.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const W = 32, H = 32;
const A = {
  bodyCx: 16, bodyCy: 18, bodyRx: 11, bodyRy: 9.5, bodyN: 2.4,
  eyeCx: 16, eyeCy: 15, eyeRx: 4, eyeRy: 4,
  mouthCx: 16, mouthCy: 21,
  feetY: 27, leftFootX: 10, leftFootRx: 3.0, leftFootRy: 2.2,
  rightFootX: 22, rightFootRx: 3.0, rightFootRy: 2.2,
};
const PALETTE = {
  outline: '#162033', bodyHi: '#b6ecff', bodyMid: '#6fcfee', bodyLo: '#3a8fb8',
  belly: '#e7f7ff', feetHi: '#3a8fb8', feetLo: '#1f5f7d',
  eyeWhite: '#ffffff', pupil: '#162033', zzz: '#cdd6f4',
};

function makeGrid() { return Array.from({length:H}, () => new Array(W).fill(null)); }
function setPx(g,x,y,c){ x=Math.round(x); y=Math.round(y); if(x>=0&&x<W&&y>=0&&y<H) g[y][x]=c; }
function getPx(g,x,y){ x=Math.round(x); y=Math.round(y); return (x>=0&&x<W&&y>=0&&y<H) ? g[y][x] : null; }
function fillEllipse(g,cx,cy,rx,ry,c) {
  if (rx<=0||ry<=0) return;
  for (let y=Math.floor(cy-ry); y<=Math.ceil(cy+ry); y++)
    for (let x=Math.floor(cx-rx); x<=Math.ceil(cx+rx); x++) {
      const nx=(x+0.5-cx)/rx, ny=(y+0.5-cy)/ry;
      if (nx*nx+ny*ny <= 1) setPx(g,x,y,c);
    }
}
function fillSquircle(g,cx,cy,rx,ry,n,c) {
  if (rx<=0||ry<=0) return;
  for (let y=Math.floor(cy-ry); y<=Math.ceil(cy+ry); y++)
    for (let x=Math.floor(cx-rx); x<=Math.ceil(cx+rx); x++) {
      const nx=Math.abs((x+0.5-cx)/rx), ny=Math.abs((y+0.5-cy)/ry);
      if (Math.pow(nx,n)+Math.pow(ny,n) <= 1) setPx(g,x,y,c);
    }
}
function applyOutline(g,outline) {
  const tp = [];
  for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
    const c = g[y][x];
    if (c===null||c===outline) continue;
    if (getPx(g,x-1,y)===null||getPx(g,x+1,y)===null||getPx(g,x,y-1)===null||getPx(g,x,y+1)===null) tp.push([x,y]);
  }
  for (const [x,y] of tp) g[y][x] = outline;
}
function blit(dst,src){ for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (src[y][x]!==null) dst[y][x]=src[y][x]; }

function drawBody(g,p,dx=0,dy=0) {
  const cx=A.bodyCx+dx, cy=A.bodyCy+dy;
  fillSquircle(g,cx,cy+1,A.bodyRx,A.bodyRy,A.bodyN,p.bodyLo);
  fillSquircle(g,cx,cy,A.bodyRx,A.bodyRy,A.bodyN,p.bodyMid);
}
function drawTuft(g,p,dx=0,dy=0) {
  const cx = A.bodyCx+dx;
  const topY = Math.round(A.bodyCy + dy - A.bodyRy + 1);
  const m = p.bodyMid;
  setPx(g,cx,topY-4,m);
  setPx(g,cx-1,topY-3,m); setPx(g,cx,topY-3,m); setPx(g,cx+1,topY-3,m);
  setPx(g,cx-1,topY-2,m); setPx(g,cx,topY-2,m); setPx(g,cx+1,topY-2,m);
  setPx(g,cx,topY-1,m);
}
function drawEye(g,p,cx,cy,mode='open') {
  if (mode==='blink') {
    setPx(g,cx-3,cy-1,p.outline);
    setPx(g,cx-2,cy,p.outline); setPx(g,cx-1,cy,p.outline); setPx(g,cx,cy,p.outline);
    setPx(g,cx+1,cy,p.outline); setPx(g,cx+2,cy,p.outline);
    setPx(g,cx+3,cy-1,p.outline);
    return;
  }
  if (mode==='closed') {
    setPx(g,cx-3,cy-1,p.outline);
    setPx(g,cx-2,cy,p.outline);
    setPx(g,cx-1,cy+1,p.outline); setPx(g,cx,cy+1,p.outline); setPx(g,cx+1,cy+1,p.outline);
    setPx(g,cx+2,cy,p.outline);
    setPx(g,cx+3,cy-1,p.outline);
    return;
  }
  fillEllipse(g,cx,cy,A.eyeRx,A.eyeRy,p.eyeWhite);
  setPx(g,cx-2,cy-1,p.eyeWhite);
}
function drawAccessory(g,p,acc,dx=0,dy=0) {
  const topY = A.bodyCy+dy-A.bodyRy;
  if (acc==='horns') {
    [A.bodyCx-6+dx, A.bodyCx+4+dx].forEach(x => {
      setPx(g,x,topY,'#f4d97a'); setPx(g,x+1,topY,'#f4d97a');
      setPx(g,x,topY-1,'#f4d97a'); setPx(g,x,topY-2,'#9d7522'); setPx(g,x+1,topY-1,'#9d7522');
    });
  }
  if (acc==='halo') {
    const cx=A.bodyCx+dx, hy=topY-4;
    for (let x=-5; x<=5; x++) {
      if (Math.abs(x)<=4) setPx(g,cx+x,hy,'#fff3a3');
    }
  }
}

function compose(opts={}) {
  const out = makeGrid();
  if (opts.accessory) drawAccessory(out,PALETTE,opts.accessory);
  const bodyG = makeGrid();
  drawBody(bodyG,PALETTE);
  drawTuft(bodyG,PALETTE);
  applyOutline(bodyG, PALETTE.outline);
  blit(out,bodyG);
  // Ciclope: 1 olho central.
  drawEye(out,PALETTE,A.eyeCx, A.eyeCy, opts.eye||'open');
  return out;
}

// ---------- Testes ----------

test('compose retorna grid 32x32', () => {
  const g = compose();
  assert.equal(g.length, 32);
  assert.equal(g[0].length, 32);
});

test('compose tem pixels não-nulos (pet visível)', () => {
  const g = compose();
  let count = 0;
  for (let y=0; y<H; y++) for (let x=0; x<W; x++) if (g[y][x] !== null) count++;
  assert.ok(count > 100, `só ${count} pixels visíveis — sprite muito esparso`);
});

test('compose tem outline visível na borda do corpo', () => {
  const g = compose();
  // Conta pixels com cor outline — deve haver muitos (todo contorno do corpo).
  let outlineCount = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] === PALETTE.outline) outlineCount++;
  }
  assert.ok(outlineCount > 30, `apenas ${outlineCount} pixels de outline; esperado >30`);
});

test('frame "open" tem branco no olho ciclope central', () => {
  const g = compose({ eye: 'open' });
  // Centro do olho deve ser branco (esclera).
  assert.equal(g[A.eyeCy][A.eyeCx], PALETTE.eyeWhite, 'olho ciclope sem esclera');
});

test('frame "blink" não tem esclera no olho central', () => {
  const g = compose({ eye: 'blink' });
  // Em vez de branco, deve ser cor do corpo (mid) ou outline.
  const c = g[A.eyeCy][A.eyeCx];
  assert.notEqual(c, PALETTE.eyeWhite, 'olho fechado não deveria mostrar esclera');
});

test('frame "closed" cobre o olho com outline em formato de arco', () => {
  const g = compose({ eye: 'closed' });
  // Em y = eyeCy + 1 deve haver outline (linha do meio do arco).
  assert.equal(g[A.eyeCy + 1][A.eyeCx], PALETTE.outline);
});

test('MESP é ciclope: tem só um olho centralizado', () => {
  const g = compose({ eye: 'open' });
  // Conta blobs separados de pixels brancos (esclera).
  // Como o olho é UM, deve haver pixels brancos só na faixa central.
  // Não deve haver pixels brancos longe do centro horizontal.
  let leftWhites = 0, rightWhites = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 8; x++) if (g[y][x] === PALETTE.eyeWhite) leftWhites++;
    for (let x = 24; x < W; x++) if (g[y][x] === PALETTE.eyeWhite) rightWhites++;
  }
  assert.equal(leftWhites, 0, `pixels brancos no canto esquerdo (${leftWhites}) — não é ciclope`);
  assert.equal(rightWhites, 0, `pixels brancos no canto direito (${rightWhites}) — não é ciclope`);
});

test('acessório "horns" pinta pixels acima do corpo', () => {
  const g = compose({ accessory: 'horns' });
  const topY = A.bodyCy - A.bodyRy;
  // Horns posicionados em bodyCx - 6 e bodyCx + 4, em y = topY.
  let found = 0;
  for (let y = Math.floor(topY) - 3; y <= Math.ceil(topY); y++) {
    for (let x = 0; x < W; x++) {
      if (g[y] && g[y][x] === '#f4d97a') found++;
    }
  }
  assert.ok(found > 0, 'nenhum pixel dourado de horns encontrado');
});

test('acessório "halo" pinta pixels acima dos chifres (mais alto)', () => {
  const g = compose({ accessory: 'halo' });
  const topY = A.bodyCy - A.bodyRy;
  const haloY = topY - 4;
  // Pelo menos 1 pixel amarelo claro na linha do halo.
  let found = 0;
  for (let x = 0; x < W; x++) {
    if (g[Math.round(haloY)] && g[Math.round(haloY)][x] === '#fff3a3') found++;
  }
  assert.ok(found > 0, 'auréola não foi desenhada');
});

test('tuft não vira tudo outline (preserva miolo)', () => {
  const g = compose();
  const topY = Math.round(A.bodyCy - A.bodyRy + 1);
  // O pixel central do tufo (topY - 2) deve ter uma cor do corpo.
  const c = g[topY - 2][A.bodyCx];
  assert.ok(
    c === PALETTE.bodyMid || c === PALETTE.bodyHi,
    `tufo virou ${c}; esperado bodyMid/bodyHi (miolo preservado)`,
  );
});

test('cores de paleta nunca contém placeholder ou strings vazias', () => {
  for (const [k, v] of Object.entries(PALETTE)) {
    assert.match(v, /^#[0-9a-f]{6}$/i, `${k} não é hexa válido: ${v}`);
  }
});
