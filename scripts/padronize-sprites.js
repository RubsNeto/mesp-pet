/* eslint-disable */
// scripts/padronize-sprites.js
//
// Normaliza todos os sprites do MESP para um canvas único (256x256), com:
//   - bbox do conteúdo não-transparente detectado
//   - escala proporcional para caber em (TARGET - PAD*2) na maior dimensão
//   - posição: centralizado horizontalmente, alinhado pelos PÉS (bottom)
//
// Usa nearest-neighbor para preservar estilo pixel-art. Sobrescreve os PNGs
// originais em src/assets/sprites/mesp/. Faça backup antes se quiser.

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const SPRITES_DIR = path.resolve(__dirname, '..', 'src', 'assets', 'sprites', 'mesp');
const TARGET = 256;
const PAD = 6; // margem mínima nas bordas

function detectBBox(png) {
  const { width, height, data } = png;
  let xMin = width, yMin = height, xMax = -1, yMax = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = data[(y * width + x) * 4 + 3];
      if (a < 8) continue;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  if (xMax < 0) return null;
  return { xMin, yMin, xMax, yMax };
}

function nearestSample(src, sw, sh, sx, sy) {
  const x = Math.max(0, Math.min(sw - 1, sx));
  const y = Math.max(0, Math.min(sh - 1, sy));
  const i = (y * sw + x) * 4;
  return [src[i], src[i + 1], src[i + 2], src[i + 3]];
}

function processFile(file) {
  const full = path.join(SPRITES_DIR, file);
  const png = PNG.sync.read(fs.readFileSync(full));
  const bbox = detectBBox(png);
  if (!bbox) {
    console.log(`  ${file}: bbox vazio, pulando`);
    return;
  }
  const bw = bbox.xMax - bbox.xMin + 1;
  const bh = bbox.yMax - bbox.yMin + 1;

  // Escala uniforme pra caber na área útil.
  const usable = TARGET - PAD * 2;
  const scale = Math.min(usable / bw, usable / bh);
  const newW = Math.max(1, Math.round(bw * scale));
  const newH = Math.max(1, Math.round(bh * scale));

  // Posição final: centralizado horizontal, bottom-aligned (pés a PAD do fundo).
  const dstX = Math.round((TARGET - newW) / 2);
  const dstY = TARGET - PAD - newH;

  // Cria canvas 256x256 transparente.
  const out = new PNG({ width: TARGET, height: TARGET });
  out.data.fill(0);

  // Desenha o bbox escalado (nearest-neighbor a partir do source bbox).
  for (let y = 0; y < newH; y += 1) {
    const sy = bbox.yMin + Math.floor((y + 0.5) * bh / newH);
    for (let x = 0; x < newW; x += 1) {
      const sx = bbox.xMin + Math.floor((x + 0.5) * bw / newW);
      const [r, g, b, a] = nearestSample(png.data, png.width, png.height, sx, sy);
      const di = ((dstY + y) * TARGET + (dstX + x)) * 4;
      out.data[di] = r;
      out.data[di + 1] = g;
      out.data[di + 2] = b;
      out.data[di + 3] = a;
    }
  }

  fs.writeFileSync(full, PNG.sync.write(out));
  console.log(`  ${file}: ${png.width}x${png.height} bbox(${bw}x${bh}) -> 256x256 sprite(${newW}x${newH}@${dstX},${dstY})`);
}

function main() {
  const files = fs
    .readdirSync(SPRITES_DIR)
    .filter((f) => f.endsWith('.png'))
    .sort();
  console.log(`Padronizando ${files.length} sprites para ${TARGET}x${TARGET}...`);
  for (const f of files) processFile(f);
  console.log('Pronto.');
}

main();
