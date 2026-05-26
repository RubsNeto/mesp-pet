/* eslint-disable */
// scripts/measure-eyes.js
//
// Lê cada sprite do MESP em src/assets/sprites/mesp e calcula o bounding box
// dos pixels da ESCLERA (parte branca do olho). Imprime um objeto JS pronto
// para colar em src/assets/sprites/index.ts.
//
// Heurística de detecção de "branco":
//   - alpha > 200
//   - R, G, B todos >= 230
//   - desconsidera pixels muito claros mas ainda azulados (R/B ratio)
//
// O sprite original é 256x224. O componente Pet renderiza dentro de 128x128
// com object-fit: contain, então a imagem fica 128x112 com 8px de letterbox
// no topo e no fundo. Convertemos as coordenadas:
//
//     renderX = sx * 128 / 256        // = sx / 2
//     renderY = 8 + sy * 112 / 224    // = 8 + sy / 2
//
// O resultado é um EyeConfig: { cx, cy, rx, ry, size } onde rx/ry é o raio
// MÁXIMO de movimento da pupila (já descontando metade do tamanho da pupila
// e uma margem de segurança), e cx/cy é o centro do retângulo branco.

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const SPRITES_DIR = path.resolve(__dirname, '..', 'src', 'assets', 'sprites', 'mesp');
const PUPIL_SIZE = 5;
const SAFETY_MARGIN = 1; // px extra dentro do branco que a pupila não invade

function isWhite(r, g, b, a) {
  if (a < 240) return false;
  // Branco da esclera é praticamente RGB(255,255,255). Highlights do corpo
  // costumam ser ciano claro tipo (220, 240, 250). Filtramos por:
  //   - todos os canais >= 250
  //   - desvio entre canais <= 4
  if (r < 250 || g < 250 || b < 250) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min > 4) return false;
  return true;
}

function measure(file) {
  const buf = fs.readFileSync(file);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;

  // 1) Constroi máscara binária de pixels brancos.
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (isWhite(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        mask[y * width + x] = 1;
      }
    }
  }

  // 2) Encontra componentes conectados (4-vizinhança) e devolve o maior.
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let best = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;
      let top = 0;
      stack[top++] = start;
      visited[start] = 1;
      let cnt = 0;
      let xMin = x, yMin = y, xMax = x, yMax = y;
      while (top > 0) {
        const idx = stack[--top];
        const cx = idx % width;
        const cy = (idx - cx) / width;
        cnt += 1;
        if (cx < xMin) xMin = cx;
        if (cx > xMax) xMax = cx;
        if (cy < yMin) yMin = cy;
        if (cy > yMax) yMax = cy;
        // 4 vizinhos
        if (cx > 0) {
          const ni = idx - 1;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack[top++] = ni; }
        }
        if (cx < width - 1) {
          const ni = idx + 1;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack[top++] = ni; }
        }
        if (cy > 0) {
          const ni = idx - width;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack[top++] = ni; }
        }
        if (cy < height - 1) {
          const ni = idx + width;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack[top++] = ni; }
        }
      }
      if (!best || cnt > best.count) {
        best = { count: cnt, xMin, yMin, xMax, yMax };
      }
    }
  }

  return best
    ? { width, height, count: best.count, xMin: best.xMin, yMin: best.yMin, xMax: best.xMax, yMax: best.yMax }
    : { width, height, count: 0, xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
}

function spriteToRender(sx, sy, sw, sh) {
  // Converte coordenadas da imagem original para o canvas de renderização
  // (atual: 96x96, definido por TARGET). object-fit: contain — letterbox no
  // eixo menor se o sprite não for quadrado.
  const TARGET = 96;
  const scale = Math.min(TARGET / sw, TARGET / sh);
  const renderW = sw * scale;
  const renderH = sh * scale;
  const xPad = (TARGET - renderW) / 2;
  const yPad = (TARGET - renderH) / 2;
  return { x: xPad + sx * scale, y: yPad + sy * scale };
}

function buildConfig(measurement) {
  const { width, height, count, xMin, yMin, xMax, yMax } = measurement;
  // Em olhos fechados (piscando, dormindo) o branco residual é muito pequeno
  // ou inexistente. Exigimos uma esclera com pelo menos 0.5% da área total.
  const minCount = Math.max(50, Math.floor((width * height) * 0.0008));
  if (count < minCount) return null;
  const tl = spriteToRender(xMin, yMin, width, height);
  const br = spriteToRender(xMax + 1, yMax + 1, width, height);
  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2;
  const halfW = (br.x - tl.x) / 2;
  const halfH = (br.y - tl.y) / 2;
  // Range: o quanto o CENTRO da pupila pode se afastar do centro do olho
  // sem que a borda da pupila saia da esclera.
  const rx = Math.max(0, halfW - PUPIL_SIZE / 2 - SAFETY_MARGIN);
  const ry = Math.max(0, halfH - PUPIL_SIZE / 2 - SAFETY_MARGIN);
  return {
    cx: round1(cx),
    cy: round1(cy),
    rx: round1(rx),
    ry: round1(ry),
    size: PUPIL_SIZE,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Mapeamento de nome de arquivo para a chave usada em SPRITE_EYE.
// Assumimos que o nome do arquivo (sem extensão) é a "chave canônica".
function spriteKey(file) {
  return path.basename(file, '.png');
}

function main() {
  const files = fs
    .readdirSync(SPRITES_DIR)
    .filter((f) => f.endsWith('.png'))
    .sort();

  const result = {};
  const log = [];
  for (const f of files) {
    const full = path.join(SPRITES_DIR, f);
    const m = measure(full);
    const key = spriteKey(f);
    const cfg = buildConfig(m);
    result[key] = cfg;
    log.push({
      key,
      whitePx: m.count,
      bbox: m.count > 0 ? `(${m.xMin},${m.yMin})-(${m.xMax},${m.yMax})` : '-',
      cfg,
    });
  }

  console.table(log);
  console.log('\n// Cole o trecho abaixo em src/assets/sprites/index.ts:\n');
  console.log('export const SPRITE_EYE_RAW = ' + JSON.stringify(result, null, 2) + ';');
}

main();
