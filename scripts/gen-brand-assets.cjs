// Generates every brand asset from the official MESP sprite (the app's own composer in
// src/procedural). The character is never redrawn, recoloured or filtered: it is only
// cropped to its visible pixels and enlarged by whole-number factors. Sizes smaller than
// the sprite itself (16 and 24 px icons) are reduced by area averaging.
//
//   build/icon.png (1024)            app icon for macOS and Linux
//   build/icon.ico                   Windows app, shortcuts, installer and uninstaller
//   electron/dockTrayIcon.ts         tray image in several pixel densities
//   landing/src/app/favicon.ico      site favicon
//   build/installerSidebar.bmp       NSIS welcome/finish panel (164x314)
//   build/installerHeader.bmp        NSIS inner pages header (150x57)
//   build/dmg-background(@2x).png    macOS disk image window
//
// Run with: npm run gen:brand
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build');
const FONT = "'Segoe UI Variable Display','Segoe UI','SF Pro Display',system-ui,sans-serif";

const bundle = (platform) =>
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'mesp-art-entry.ts')],
    bundle: true,
    format: platform === 'node' ? 'cjs' : 'iife',
    globalName: platform === 'node' ? undefined : 'MespArt',
    platform,
    resolveExtensions: ['.ts', '.tsx', '.mjs', '.js'],
    write: false,
    logLevel: 'warning',
  }).outputFiles[0].text;

// ----- Sprite as RGBA -------------------------------------------------------------------

function loadSprite() {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', bundle('node'))(module, module.exports, require);
  const grid = module.exports.officialMesp();
  const rows = grid.map((row, y) => ({ row, y })).filter(({ row }) => row.some((c) => c !== null));
  const columns = grid[0].map((_, x) => x).filter((x) => grid.some((row) => row[x] !== null));
  const top = rows[0].y;
  const left = columns[0];
  const width = columns[columns.length - 1] - left + 1;
  const height = rows[rows.length - 1].y - top + 1;
  const pixel = (x, y) => {
    const cell = grid[top + y][left + x];
    if (cell === null) return [0, 0, 0, 0];
    const hex = cell.replace('#', '');
    const full = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex;
    return [0, 2, 4, 6].map((i) => (i < full.length ? parseInt(full.slice(i, i + 2), 16) : 255));
  };
  return { width, height, pixel };
}

/** Square transparent PNG with the sprite centred, enlarged by an integer factor. */
function spriteSquare(sprite, size, fill = 0.94) {
  const png = new PNG({ width: size, height: size });
  png.data.fill(0);
  const largest = Math.max(sprite.width, sprite.height);
  const scale = Math.floor((size * fill) / largest);
  if (scale >= 1) {
    const offsetX = Math.floor((size - sprite.width * scale) / 2);
    const offsetY = Math.floor((size - sprite.height * scale) / 2);
    for (let y = 0; y < sprite.height * scale; y += 1)
      for (let x = 0; x < sprite.width * scale; x += 1) {
        const i = ((offsetY + y) * size + offsetX + x) * 4;
        sprite.pixel(Math.floor(x / scale), Math.floor(y / scale)).forEach((v, k) => {
          png.data[i + k] = v;
        });
      }
    return png;
  }
  // Smaller than the sprite: area-average each target pixel (premultiplied alpha).
  const ratio = largest / (size * fill);
  const drawnW = sprite.width / ratio;
  const drawnH = sprite.height / ratio;
  const offsetX = (size - drawnW) / 2;
  const offsetY = (size - drawnH) / 2;
  for (let ty = 0; ty < size; ty += 1)
    for (let tx = 0; tx < size; tx += 1) {
      const sum = [0, 0, 0, 0];
      let area = 0;
      const x0 = (tx - offsetX) * ratio;
      const y0 = (ty - offsetY) * ratio;
      for (let sy = Math.floor(y0); sy < Math.ceil(y0 + ratio); sy += 1)
        for (let sx = Math.floor(x0); sx < Math.ceil(x0 + ratio); sx += 1) {
          const cover =
            Math.max(0, Math.min(sx + 1, x0 + ratio) - Math.max(sx, x0)) *
            Math.max(0, Math.min(sy + 1, y0 + ratio) - Math.max(sy, y0));
          area += cover;
          if (cover <= 0 || sx < 0 || sy < 0 || sx >= sprite.width || sy >= sprite.height) continue;
          const [r, g, b, a] = sprite.pixel(sx, sy);
          sum[0] += r * a * cover;
          sum[1] += g * a * cover;
          sum[2] += b * a * cover;
          sum[3] += a * cover;
        }
      const i = (ty * size + tx) * 4;
      const alpha = area ? sum[3] / area : 0;
      png.data[i + 3] = Math.round(alpha);
      if (sum[3] > 0) for (let k = 0; k < 3; k += 1) png.data[i + k] = Math.round(sum[k] / sum[3]);
    }
  return png;
}

function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  const bodies = images.map((png, index) => {
    const data = PNG.sync.write(png);
    const entry = 6 + index * 16;
    header[entry] = png.width >= 256 ? 0 : png.width;
    header[entry + 1] = png.height >= 256 ? 0 : png.height;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
    return data;
  });
  return Buffer.concat([header, ...bodies]);
}

function writeIcons() {
  const sprite = loadSprite();
  fs.writeFileSync(path.join(OUT, 'icon.png'), PNG.sync.write(spriteSquare(sprite, 1024)));
  const windowsSizes = [256, 128, 64, 48, 32, 24, 16];
  fs.writeFileSync(
    path.join(OUT, 'icon.ico'),
    ico(windowsSizes.map((size) => spriteSquare(sprite, size))),
  );
  fs.writeFileSync(
    path.join(ROOT, 'landing', 'src', 'app', 'favicon.ico'),
    ico([48, 32, 16].map((size) => spriteSquare(sprite, size))),
  );
  // Tray: 16 px at 100 % scale, up to 64 px at 400 %.
  const tray = [
    [1, 16],
    [1.5, 24],
    [2, 32],
    [3, 48],
    [4, 64],
  ].map(
    ([scale, size]) =>
      `  { scaleFactor: ${scale}, png: '${PNG.sync.write(spriteSquare(sprite, size, 1)).toString('base64')}' },`,
  );
  fs.writeFileSync(
    path.join(ROOT, 'electron', 'dockTrayIcon.ts'),
    [
      '// Generated by scripts/gen-brand-assets.cjs from the official MESP sprite. Do not edit.',
      'export const TRAY_ICON_REPRESENTATIONS: ReadonlyArray<{ scaleFactor: number; png: string }> = [',
      ...tray,
      '];',
      '',
    ].join('\n'),
  );
}

// ----- Installer art (rendered by Chromium) ---------------------------------------------

const star = (x, y, size, alpha, color = '255,255,255') =>
  `<i style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:rgba(${color},${alpha})"></i>`;
const sparkle = (x, y, color) => `
<i style="position:absolute;left:${x}px;top:${y - 3}px;width:2px;height:8px;background:${color}"></i>
<i style="position:absolute;left:${x - 3}px;top:${y}px;width:8px;height:2px;background:${color}"></i>`;

const ART = {
  sidebar: {
    width: 164,
    height: 314,
    html: `
<div style="position:absolute;inset:0;background:linear-gradient(168deg,#0d1424 0%,#080b14 52%,#05060a 100%)"></div>
<div style="position:absolute;inset:0;background:
  radial-gradient(90px 120px at 50% 128px,rgba(111,207,238,.42),transparent 72%),
  radial-gradient(120px 90px at 12% 6%,rgba(132,104,255,.26),transparent 70%),
  radial-gradient(110px 90px at 96% 78%,rgba(244,138,178,.12),transparent 70%)"></div>
${star(22, 64, 2, 0.55)}${star(136, 52, 2, 0.4)}${star(30, 178, 2, 0.3)}${star(140, 160, 2, 0.5)}
${star(118, 22, 1, 0.6)}${star(46, 30, 1, 0.45)}${star(14, 120, 1, 0.5)}${star(150, 112, 1, 0.4)}
${star(98, 270, 1, 0.35)}${star(58, 286, 1, 0.3)}
${sparkle(130, 82, 'rgba(182,236,255,.85)')}${sparkle(32, 146, 'rgba(182,236,255,.55)')}
<div style="position:absolute;left:50%;top:128px;width:128px;height:128px;transform:translate(-50%,-50%);
  border-radius:50%;border:1px solid rgba(182,236,255,.12)"></div>
<div style="position:absolute;left:50%;top:128px;width:96px;height:96px;transform:translate(-50%,-50%);
  border-radius:50%;border:1px dashed rgba(182,236,255,.07)"></div>
<i style="position:absolute;left:${82 + 64 * Math.cos(-0.6) - 2}px;top:${128 + 64 * Math.sin(-0.6) - 2}px;
  width:4px;height:4px;border-radius:50%;background:#8ad8f5;box-shadow:0 0 8px 2px rgba(138,216,245,.7)"></i>
<div style="position:absolute;left:50%;top:160px;width:96px;height:18px;transform:translateX(-50%);
  border-radius:50%;background:radial-gradient(closest-side,rgba(138,216,245,.45),rgba(138,216,245,.08) 70%,transparent)"></div>
<img data-mesp="3" style="position:absolute;left:50%;top:168px;transform:translate(-50%,-100%);image-rendering:pixelated">
<div style="position:absolute;top:206px;left:0;right:0;text-align:center;
  font:700 31px/1 ${FONT};letter-spacing:-.04em;color:transparent;
  background:linear-gradient(180deg,#ffffff 30%,#bfeaff);-webkit-background-clip:text;background-clip:text">MESP</div>
<div style="position:absolute;top:246px;left:0;right:0;text-align:center;color:rgba(214,226,240,.62);
  font:400 10.5px/1.55 ${FONT}">Agentes de código<br>no topo da tela</div>
<div style="position:absolute;top:16px;left:50%;transform:translateX(-50%);width:72px;height:18px;
  border-radius:10px;background:#000;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 6px 16px rgba(0,0,0,.6);
  display:flex;align-items:center;gap:5px;padding:0 7px;box-sizing:border-box">
  <span style="width:5px;height:5px;border-radius:50%;background:#8ad8f5;box-shadow:0 0 6px rgba(138,216,245,.9)"></span>
  <span style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.28)"></span>
  <span style="width:8px;height:3px;border-radius:2px;background:rgba(255,255,255,.14)"></span>
</div>`,
  },
  header: {
    width: 150,
    height: 57,
    html: `
<div style="position:absolute;inset:0;background:#fff"></div>
<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;padding-right:14px">
  <img data-mesp="fit:47" style="image-rendering:pixelated">
</div>`,
  },
  dmg: {
    width: 540,
    height: 380,
    html: `
<div style="position:absolute;inset:0;background:linear-gradient(180deg,#fbfcfe 0%,#eef3f8 100%)"></div>
<div style="position:absolute;inset:0;background:
  radial-gradient(240px 150px at 50% 0%,rgba(111,207,238,.26),transparent 70%),
  radial-gradient(200px 140px at 0% 100%,rgba(132,104,255,.08),transparent 70%)"></div>
${star(64, 58, 3, 0.35, '111,207,238')}${star(470, 92, 3, 0.3, '111,207,238')}${star(96, 300, 2, 0.3, '132,104,255')}
${sparkle(452, 52, 'rgba(111,207,238,.55)')}${sparkle(84, 112, 'rgba(132,104,255,.35)')}
<div style="position:absolute;top:30px;left:0;right:0;display:flex;align-items:flex-end;justify-content:center;gap:12px">
  <img data-mesp="2" style="image-rendering:pixelated">
  <span style="color:#0b0b0e;font:700 26px/1 ${FONT};letter-spacing:-.035em;padding-bottom:6px">Instale o MESP</span>
</div>
<div style="position:absolute;top:96px;left:0;right:0;text-align:center;color:#5d6470;
  font:400 13px/1.4 ${FONT}">Arraste o ícone para a pasta Aplicativos.</div>
<svg style="position:absolute;left:222px;top:186px" width="96" height="28" viewBox="0 0 96 28">
  <path d="M6 14h76" stroke="#a7b3c2" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1 7"/>
  <path d="M78 6l9 8-9 8" fill="none" stroke="#6b7685" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
<div style="position:absolute;bottom:20px;left:0;right:0;text-align:center;color:#8b93a0;
  font:400 11px/1.5 ${FONT}">Se o macOS bloquear a abertura: Ajustes › Privacidade e Segurança › Abrir mesmo assim.</div>`,
  },
};

function page({ width, height, html }, scale, browserBundle) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${width * scale}px;height:${height * scale}px;overflow:hidden;background:#000}
#art{position:relative;width:${width}px;height:${height}px;zoom:${scale};overflow:hidden;
-webkit-font-smoothing:antialiased}
</style></head><body><div id="art">${html}</div>
<script>${browserBundle}
// data-mesp="N" draws the sprite at N pixels per sprite pixel; "fit:H" picks the largest
// integer scale whose height fits H.
const spriteHeight = MespArt.officialMesp().filter((row) => row.some((cell) => cell !== null)).length;
for (const img of document.querySelectorAll('img[data-mesp]')) {
  const spec = img.dataset.mesp;
  const scale = spec.startsWith('fit:')
    ? Math.max(1, Math.floor(Number(spec.slice(4)) / spriteHeight))
    : Number(spec);
  img.src = MespArt.mespDataUrl(scale);
}
</script></body></html>`;
}

async function render(spec, scale, browserBundle) {
  const width = spec.width * scale;
  const height = spec.height * scale;
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: { offscreen: true },
  });
  await win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(page(spec, scale, browserBundle))}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  let image = await win.webContents.capturePage();
  const size = image.getSize();
  if (size.width !== width || size.height !== height)
    image = image.resize({ width, height, quality: 'best' });
  win.destroy();
  return PNG.sync.read(image.toPNG());
}

// 24-bit BI_RGB bitmap, bottom-up rows padded to 4 bytes, as NSIS expects.
function toBmp(png) {
  const { width, height, data } = png;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixels = rowSize * height;
  const buffer = Buffer.alloc(54 + pixels);
  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(54 + pixels, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixels, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y += 1) {
    const row = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      buffer[row + x * 3] = data[source + 2];
      buffer[row + x * 3 + 1] = data[source + 1];
      buffer[row + x * 3 + 2] = data[source];
    }
  }
  return buffer;
}

app.disableHardwareAcceleration();
// Each render closes its window; keep the app alive until every file is written.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    writeIcons();
    const browserBundle = bundle('browser');
    fs.writeFileSync(
      path.join(OUT, 'installerSidebar.bmp'),
      toBmp(await render(ART.sidebar, 1, browserBundle)),
    );
    fs.writeFileSync(
      path.join(OUT, 'installerHeader.bmp'),
      toBmp(await render(ART.header, 1, browserBundle)),
    );
    fs.writeFileSync(
      path.join(OUT, 'dmg-background.png'),
      PNG.sync.write(await render(ART.dmg, 1, browserBundle)),
    );
    fs.writeFileSync(
      path.join(OUT, 'dmg-background@2x.png'),
      PNG.sync.write(await render(ART.dmg, 2, browserBundle)),
    );
    // Enlarged previews, for review only.
    const preview = process.env.MESP_ART_PREVIEW;
    if (preview) {
      for (const name of ['sidebar', 'header'])
        fs.writeFileSync(
          path.join(preview, `${name}.png`),
          PNG.sync.write(await render(ART[name], 2, browserBundle)),
        );
    }
    console.log('brand assets written');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
