// Bundled by scripts/gen-installer-art.cjs: the official MESP sprite, drawn by the app's
// own composer, with the pupil painted the same way as the customizer thumbnails.
import { composeMesp, MESP_ANATOMY } from '../src/procedural/composer';
import { DEFAULT_TRAITS, makeTraits } from '../src/procedural/traits';
import type { Grid } from '../src/procedural/primitives';

export type Family = Parameters<typeof makeTraits>[0]['family'];

export function officialMesp(family?: Family): Grid {
  const traits = family ? makeTraits({ family }) : DEFAULT_TRAITS;
  const grid = composeMesp({ traits, eye: 'open', feet: 'normal' });
  const { eyeCx, eyeCy } = MESP_ANATOMY;
  for (let y = eyeCy - 2; y <= eyeCy + 1; y += 1) {
    for (let x = eyeCx - 2; x <= eyeCx + 1; x += 1) {
      const corner = (x === eyeCx - 2 || x === eyeCx + 1) && (y === eyeCy - 2 || y === eyeCy + 1);
      if (!corner && grid[y]?.[x] === traits.palette.eyeWhite) grid[y]![x] = traits.palette.pupil;
    }
  }
  if (grid[eyeCy - 1]?.[eyeCx - 1] === traits.palette.pupil) {
    grid[eyeCy - 1]![eyeCx - 1] = traits.palette.eyeWhite;
  }
  return grid;
}

/** Crisp PNG of the sprite cropped to its visible pixels, at an integer scale. */
export function mespDataUrl(scale: number, family?: Family): string {
  const grid = officialMesp(family);
  let top = grid.length;
  let left = grid[0]!.length;
  let bottom = -1;
  let right = -1;
  grid.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell === null) return;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }),
  );
  const canvas = document.createElement('canvas');
  canvas.width = (right - left + 1) * scale;
  canvas.height = (bottom - top + 1) * scale;
  const context = canvas.getContext('2d')!;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const cell = grid[y]![x];
      if (cell === null || cell === undefined) continue;
      context.fillStyle = cell;
      context.fillRect((x - left) * scale, (y - top) * scale, scale, scale);
    }
  }
  return canvas.toDataURL('image/png');
}
