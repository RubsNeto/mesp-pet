// Generates build/icon.png (512x512), the MESP mascot used by electron-builder for the
// installer, executable and shortcuts. Same shapes as the tray icon in electron/main.ts.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const SIZE = 512;
const png = new PNG({ width: SIZE, height: SIZE });
const blend = (x, y, [r, g, b], alpha) => {
  const i = (y * SIZE + x) * 4;
  const a = alpha + (png.data[i + 3] / 255) * (1 - alpha);
  if (a <= 0) return;
  for (const [k, v] of [r, g, b].entries())
    png.data[i + k] = Math.round(
      (v * alpha + png.data[i + k] * (png.data[i + 3] / 255) * (1 - alpha)) / a,
    );
  png.data[i + 3] = Math.round(a * 255);
};
// Anti-aliased disc: coverage from signed distance to the edge.
const disc = (cx, cy, radius, color) => {
  for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y += 1)
    for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x += 1) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
      const coverage = Math.min(
        1,
        Math.max(0, radius - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5),
      );
      if (coverage > 0) blend(x, y, color, coverage);
    }
};
const roundedSquare = (inset, radius, color) => {
  for (let y = 0; y < SIZE; y += 1)
    for (let x = 0; x < SIZE; x += 1) {
      const dx = Math.max(inset + radius - (x + 0.5), 0, x + 0.5 - (SIZE - inset - radius));
      const dy = Math.max(inset + radius - (y + 0.5), 0, y + 0.5 - (SIZE - inset - radius));
      const coverage = Math.min(1, Math.max(0, radius - Math.hypot(dx, dy) + 0.5));
      if (coverage > 0) blend(x, y, color, coverage);
    }
};

roundedSquare(16, 112, [10, 10, 12]); // black island tile
disc(256, 276, 168, [111, 207, 238]); // cyan body
disc(256, 228, 70, [255, 255, 255]); // single eye
disc(256, 228, 32, [22, 32, 51]); // pupil
disc(242, 214, 10, [255, 255, 255]); // highlight

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
console.log(out);
