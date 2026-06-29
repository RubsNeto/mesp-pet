// gen-icons.cjs — gera ícones PNG (sem dependências) para a extensão.
// Desenha um fundo arredondado roxo com duas setas (cima/baixo) brancas = "scroll".
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// pixels: Uint8Array RGBA, size x size
function encodePNG(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = 0 (compression/filter/interlace)
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    pixels.copy
      ? pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
      : Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22; // raio do canto
  const cx = size / 2;

  function setPx(x, y, col) {
    const i = (y * size + x) * 4;
    px[i] = col[0];
    px[i + 1] = col[1];
    px[i + 2] = col[2];
    px[i + 3] = col[3];
  }

  const bg = [124, 92, 255, 255]; // roxo
  const fg = [255, 255, 255, 255]; // branco

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // cantos arredondados
      let inside = true;
      const corners = [
        [r, r],
        [size - r, r],
        [r, size - r],
        [size - r, size - r],
      ];
      for (const [cxr, cyr] of corners) {
        const inCornerBox =
          (x < r && y < r && cxr === r && cyr === r) ||
          (x > size - r && y < r && cxr === size - r && cyr === r) ||
          (x < r && y > size - r && cxr === r && cyr === size - r) ||
          (x > size - r && y > size - r && cxr === size - r && cyr === size - r);
        if (inCornerBox) {
          const d = Math.hypot(x + 0.5 - cxr, y + 0.5 - cyr);
          if (d > r) inside = false;
        }
      }
      if (inside) setPx(x, y, bg);
    }
  }

  // setas: ^ no topo e v embaixo
  const thick = Math.max(1, Math.round(size * 0.09));
  const half = size * 0.18;
  function drawChevron(centerY, up) {
    for (let t = -half; t <= half; t++) {
      const x = Math.round(cx + t);
      // y cresce conforme distância do centro -> forma de V/^
      const dy = Math.abs(t) * 0.9;
      const baseY = up ? centerY + dy : centerY - dy;
      for (let w = 0; w < thick; w++) {
        const y = Math.round(baseY + (up ? w : -w));
        if (x >= 0 && x < size && y >= 0 && y < size) setPx(x, y, fg);
      }
    }
  }
  drawChevron(size * 0.30, true); // ^ topo
  drawChevron(size * 0.70, false); // v base

  return encodePNG(size, px);
}

const outDir = path.join(__dirname, '21st-scroll-extension', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const s of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${s}.png`), makeIcon(s));
  console.log('gerado icon' + s + '.png');
}
