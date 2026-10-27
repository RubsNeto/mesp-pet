// Generates the installer artwork in build/:
//   installerSidebar.bmp (164x314)  NSIS welcome/finish panel, also used by the uninstaller
//   installerHeader.bmp  (150x57)   NSIS inner pages header (right side of a white bar)
//   dmg-background.png   (540x380) and dmg-background@2x.png for the macOS disk image
// Run with: npx electron scripts/gen-installer-art.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const OUT = path.join(__dirname, '..', 'build');
const FONT = "'Segoe UI Variable Display','Segoe UI','SF Pro Display',system-ui,sans-serif";

// Same proportions as build/icon.png: body, eye, pupil and highlight.
const mascot = (size, id) => `
<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="body-${id}" cx="36%" cy="28%" r="80%">
      <stop offset="0" stop-color="#c4f0ff"/>
      <stop offset=".5" stop-color="#6fcfee"/>
      <stop offset="1" stop-color="#3584ad"/>
    </radialGradient>
  </defs>
  <ellipse cx="50" cy="95" rx="30" ry="4" fill="rgba(0,0,0,.28)"/>
  <circle cx="50" cy="50" r="44" fill="url(#body-${id})"/>
  <circle cx="50" cy="37.5" r="18.3" fill="#fff"/>
  <circle cx="50" cy="37.5" r="8.4" fill="#16203a"/>
  <circle cx="46.2" cy="33.6" r="2.6" fill="#fff"/>
</svg>`;

const island = `
<div style="position:absolute;top:18px;left:50%;transform:translateX(-50%);width:86px;height:20px;
  border-radius:12px;background:#000;box-shadow:0 0 0 1px rgba(255,255,255,.09),0 8px 18px rgba(0,0,0,.55);
  display:flex;align-items:center;gap:6px;padding:0 9px;box-sizing:border-box">
  <span style="width:6px;height:6px;border-radius:50%;background:#8ad8f5;box-shadow:0 0 0 3px rgba(138,216,245,.18)"></span>
  <span style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.22)"></span>
</div>`;

const ART = {
  sidebar: {
    width: 164,
    height: 314,
    html: `
<div style="position:absolute;inset:0;background:
  radial-gradient(110px 110px at 50% 120px,rgba(111,207,238,.30),transparent 72%),
  linear-gradient(180deg,#141418 0%,#09090b 100%)"></div>
<div style="position:absolute;inset:0;opacity:.5;background-image:
  linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),
  linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
  background-size:16px 16px;-webkit-mask-image:radial-gradient(circle at 50% 40%,#000,transparent 70%)"></div>
${island}
<div style="position:absolute;top:72px;left:0;right:0;display:flex;justify-content:center;
  filter:drop-shadow(0 14px 22px rgba(58,143,184,.35))">${mascot(92, 's')}</div>
<div style="position:absolute;top:190px;left:0;right:0;text-align:center;color:#fff;
  font:650 30px/1 ${FONT};letter-spacing:-.035em">MESP</div>
<div style="position:absolute;top:230px;left:0;right:0;text-align:center;color:#9aa0aa;
  font:400 10.5px/1.5 ${FONT}">Agentes de código<br>no topo da tela</div>
<div style="position:absolute;bottom:18px;left:0;right:0;display:flex;justify-content:center;gap:5px">
  <i style="width:4px;height:4px;border-radius:50%;background:#8ad8f5"></i>
  <i style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.2)"></i>
  <i style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.2)"></i>
</div>`,
  },
  header: {
    width: 150,
    height: 57,
    html: `
<div style="position:absolute;inset:0;background:#fff;display:flex;align-items:center;
  justify-content:flex-end;gap:8px;padding-right:14px">
  ${mascot(32, 'h')}
  <span style="color:#0b0b0e;font:650 19px/1 ${FONT};letter-spacing:-.03em">MESP</span>
</div>`,
  },
  dmg: {
    width: 540,
    height: 380,
    html: `
<div style="position:absolute;inset:0;background:
  radial-gradient(260px 200px at 50% 0%,rgba(111,207,238,.22),transparent 70%),
  linear-gradient(180deg,#f8fafc 0%,#eef2f6 100%)"></div>
<div style="position:absolute;top:44px;left:0;right:0;text-align:center;color:#0b0b0e;
  font:650 22px/1.1 ${FONT};letter-spacing:-.025em">Instale o MESP</div>
<div style="position:absolute;top:76px;left:0;right:0;text-align:center;color:#5d6470;
  font:400 13px/1.4 ${FONT}">Arraste o ícone para a pasta Aplicativos.</div>
<svg style="position:absolute;left:222px;top:176px" width="96" height="28" viewBox="0 0 96 28">
  <path d="M4 14h80" stroke="#9aa6b5" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1 7"/>
  <path d="M78 6l9 8-9 8" fill="none" stroke="#6b7685" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
<div style="position:absolute;bottom:22px;left:0;right:0;text-align:center;color:#8b93a0;
  font:400 11px/1.5 ${FONT}">Se o macOS bloquear a abertura: Ajustes › Privacidade e Segurança › Abrir mesmo assim.</div>`,
  },
};

function page({ width, height, html }, scale) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${width * scale}px;height:${height * scale}px;overflow:hidden;background:#000}
#art{position:relative;width:${width}px;height:${height}px;zoom:${scale};overflow:hidden;
-webkit-font-smoothing:antialiased}
</style></head><body><div id="art">${html}</div></body></html>`;
}

async function render(spec, scale) {
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
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page(spec, scale))}`);
  await new Promise((resolve) => setTimeout(resolve, 400));
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
    fs.writeFileSync(path.join(OUT, 'installerSidebar.bmp'), toBmp(await render(ART.sidebar, 1)));
    fs.writeFileSync(path.join(OUT, 'installerHeader.bmp'), toBmp(await render(ART.header, 1)));
    fs.writeFileSync(
      path.join(OUT, 'dmg-background.png'),
      PNG.sync.write(await render(ART.dmg, 1)),
    );
    fs.writeFileSync(
      path.join(OUT, 'dmg-background@2x.png'),
      PNG.sync.write(await render(ART.dmg, 2)),
    );
    // Previews of the bitmaps, for review only.
    if (process.env.MESP_ART_PREVIEW) {
      fs.writeFileSync(
        path.join(process.env.MESP_ART_PREVIEW, 'sidebar.png'),
        PNG.sync.write(await render(ART.sidebar, 2)),
      );
      fs.writeFileSync(
        path.join(process.env.MESP_ART_PREVIEW, 'header.png'),
        PNG.sync.write(await render(ART.header, 2)),
      );
    }
    console.log('installer art written to build/');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
