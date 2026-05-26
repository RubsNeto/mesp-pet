/* eslint-disable */
// scripts/extract-sprites.js
//
// Garante que os sprites do MESP estejam disponíveis em src/assets/sprites/mesp.
// Estratégia:
//   1) Se já existir um sprite em src/assets/sprites/mesp, não faz nada.
//   2) Caso contrário, tenta copiar de pastas locais conhecidas:
//      - sprites_extracted/sprites_bixinho_nomeado/padronizados_256x224_nomeados (preferido)
//      - sprites_extracted/sprites_bixinho_nomeado/transparentes_nomeados
//   3) Se houver um ZIP em ./sprites_bixinho_mesp_nomeado.zip ou em
//      $env:USERPROFILE/Downloads, ele é descompactado para sprites_extracted antes da cópia.
//
// O script é tolerante: se nada existir, apenas avisa e segue, para não quebrar `npm install`.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = path.join(ROOT, 'src', 'assets', 'sprites', 'mesp');
const EXTRACT_DIR = path.join(ROOT, 'sprites_extracted');

const PREFERRED_SUBDIRS = [
  'sprites_bixinho_nomeado/padronizados_256x224_nomeados',
  'sprites_bixinho_nomeado/transparentes_nomeados',
];

// Locais possíveis para o ZIP original.
const ZIP_CANDIDATES = [
  path.join(ROOT, 'sprites_bixinho_mesp_nomeado.zip'),
  path.join(os.homedir(), 'Downloads', 'sprites_bixinho_mesp_nomeado.zip'),
];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function listPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
}

function copySpritesFrom(srcDir) {
  const files = listPngs(srcDir);
  if (files.length === 0) return 0;
  ensureDir(TARGET_DIR);
  let copied = 0;
  for (const f of files) {
    const srcFile = path.join(srcDir, f);
    const dstFile = path.join(TARGET_DIR, f);
    fs.copyFileSync(srcFile, dstFile);
    copied += 1;
  }
  return copied;
}

function tryUnzip(zipPath, outDir) {
  ensureDir(outDir);
  // Em Windows preferimos PowerShell Expand-Archive (sempre disponível).
  if (process.platform === 'win32') {
    const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force"`;
    execSync(cmd, { stdio: 'inherit' });
    return true;
  }
  // Em Mac/Linux usar `unzip` se existir.
  try {
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  // 1) Já existem sprites copiados?
  if (listPngs(TARGET_DIR).length > 0) {
    console.log(`[extract-sprites] OK: ${TARGET_DIR} já contém sprites.`);
    return;
  }

  // 2) Tenta copiar das pastas já extraídas localmente.
  for (const sub of PREFERRED_SUBDIRS) {
    const candidate = path.join(EXTRACT_DIR, sub);
    if (fs.existsSync(candidate)) {
      const n = copySpritesFrom(candidate);
      if (n > 0) {
        console.log(`[extract-sprites] Copiados ${n} sprites de ${candidate}`);
        return;
      }
    }
  }

  // 3) Tenta achar e descompactar o ZIP.
  for (const zip of ZIP_CANDIDATES) {
    if (fs.existsSync(zip)) {
      console.log(`[extract-sprites] Descompactando ${zip}...`);
      try {
        tryUnzip(zip, EXTRACT_DIR);
      } catch (err) {
        console.warn('[extract-sprites] Falha ao descompactar:', err.message);
        continue;
      }
      for (const sub of PREFERRED_SUBDIRS) {
        const candidate = path.join(EXTRACT_DIR, sub);
        if (fs.existsSync(candidate)) {
          const n = copySpritesFrom(candidate);
          if (n > 0) {
            console.log(`[extract-sprites] Copiados ${n} sprites de ${candidate}`);
            return;
          }
        }
      }
    }
  }

  console.warn(
    '[extract-sprites] AVISO: nenhum sprite encontrado.\n' +
      ` - Coloque os PNGs em ${TARGET_DIR}\n` +
      ` - Ou coloque o ZIP em ${ZIP_CANDIDATES[0]}\n` +
      ' - Ou extraia manualmente para sprites_extracted/sprites_bixinho_nomeado/'
  );
}

main();
