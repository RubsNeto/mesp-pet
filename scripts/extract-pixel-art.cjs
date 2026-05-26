/* eslint-disable */
// scripts/extract-pixel-art.cjs
//
// Lê os PNGs originais do MESP em src/assets/sprites/mesp/ e converte cada
// um em uma matriz 2D de IDs de cor (paleta global compartilhada). Salva em
// src/procedural/extracted-frames.ts — é o "código fonte" do MESP, sem PNGs.
//
// Resolução interna: 64x64. Cada pixel da imagem original (256x256) é
// agrupado em blocos de 4x4 e pega-se o pixel central (nearest neighbor).
// As cores são quantizadas em uma paleta global de até 32 cores (similar
// dentro de tolerância vai pra mesma cor).

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const SPRITES_DIR = path.resolve(__dirname, '..', 'src', 'assets', 'sprites', 'mesp');
const OUT_FILE = path.resolve(__dirname, '..', 'src', 'procedural', 'extracted-frames.ts');
const TARGET = 64;
const COLOR_TOLERANCE = 35; // distância máxima euclidiana RGB pra considerar mesma cor

// Quais sprites processar (todos os usados pelo app).
const SPRITES = [
  'mesp_frente_idle_01',
  'mesp_frente_idle_02',
  'mesp_frente_idle_03',
  'mesp_frente_idle_04',
  'mesp_frente_idle_05',
  'mesp_frente_piscando',
  'mesp_frente_boca_aberta',
  'mesp_frente_pe_aberto',
  'mesp_frente_sentado_01',
  'mesp_frente_sentado_02',
  'mesp_frente_sentado_03',
  'mesp_dormindo',
  'mesp_confuso',
  'mesp_alerta_01',
  'mesp_alerta_02',
  'mesp_agachado',
  'mesp_perfil_andando_01',
  'mesp_perfil_andando_02',
  'mesp_perfil_andando_03',
  'mesp_perfil_andando_04',
  'mesp_perfil_andando_05',
  'mesp_perfil_andando_06',
  'mesp_perfil_andando_07',
  'mesp_perfil_andando_08',
  'mesp_perfil_andando_09',
  'mesp_perfil_andando_10',
];

function readPng(p) {
  return PNG.sync.read(fs.readFileSync(p));
}

function colorDist(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Paleta global construída ao processar todos os sprites.
const palette = []; // array de [r,g,b]

function addToPalette(rgb) {
  // Acha cor mais próxima na paleta. Se < tolerância, retorna ID dela.
  // Senão adiciona nova.
  for (let i = 0; i < palette.length; i += 1) {
    if (colorDist(palette[i], rgb) < COLOR_TOLERANCE) return i;
  }
  palette.push(rgb);
  return palette.length - 1;
}

function downsample(png) {
  const { width, height, data } = png;
  const sx = width / TARGET;
  const sy = height / TARGET;
  // Matriz 2D de IDs de cor (-1 = transparente).
  const grid = Array.from({ length: TARGET }, () => new Array(TARGET).fill(-1));
  for (let y = 0; y < TARGET; y += 1) {
    for (let x = 0; x < TARGET; x += 1) {
      // Sample o pixel central do bloco.
      const px = Math.floor((x + 0.5) * sx);
      const py = Math.floor((y + 0.5) * sy);
      const idx = (py * width + px) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a < 128) {
        grid[y][x] = -1; // transparente
        continue;
      }
      grid[y][x] = addToPalette([r, g, b]);
    }
  }
  return grid;
}

function gridToCompactString(grid) {
  // Cada célula vira 1 char: 0..n da paleta vira 'A','B',... ('.' para transparente).
  // Suporta até 64 cores na paleta. Maiúsculas + minúsculas + dígitos.
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const lines = grid.map((row) =>
    row.map((id) => (id < 0 ? '.' : CHARS[id] ?? '?')).join('')
  );
  return lines;
}

function main() {
  const out = {};
  for (const name of SPRITES) {
    const file = path.join(SPRITES_DIR, name + '.png');
    if (!fs.existsSync(file)) {
      console.warn('  [skip] ' + name + ': PNG não encontrado');
      continue;
    }
    const png = readPng(file);
    const grid = downsample(png);
    out[name] = gridToCompactString(grid);
    console.log('  ' + name + ' (' + png.width + 'x' + png.height + ')');
  }

  // Gera arquivo TS.
  const lines = [];
  lines.push('// AUTO-GERADO por scripts/extract-pixel-art.cjs — não editar à mão.');
  lines.push('// Cada frame é uma matriz ' + TARGET + 'x' + TARGET + ' codificada como');
  lines.push('// strings (1 char por pixel). \'.\' = transparente.');
  lines.push('//');
  lines.push('// Total de cores: ' + palette.length);
  lines.push('');
  lines.push('export const FRAME_SIZE = ' + TARGET + ';');
  lines.push('');
  lines.push('export const PALETTE: string[] = [');
  for (const [r, g, b] of palette) {
    lines.push("  '" + rgbToHex(r, g, b) + "',");
  }
  lines.push('];');
  lines.push('');
  lines.push('export const FRAMES: Record<string, string[]> = {');
  for (const name of Object.keys(out)) {
    lines.push("  '" + name + "': [");
    for (const row of out[name]) {
      lines.push("    '" + row + "',");
    }
    lines.push('  ],');
  }
  lines.push('};');
  lines.push('');

  fs.writeFileSync(OUT_FILE, lines.join('\n'));
  console.log('\nGerado: ' + OUT_FILE);
  console.log('Paleta: ' + palette.length + ' cores');
}

main();
