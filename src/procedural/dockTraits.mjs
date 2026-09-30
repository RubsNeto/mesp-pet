import { FAMILIES, makeTraits } from './traitsCatalog.mjs';

// Anatomy stays classic even when a user manually chooses accessories.
export function classicDockTraits(traits) {
  return {
    ...traits,
    palette: { ...traits.palette, outline: '#10131a', pupil: '#10131a', eyeWhite: '#ffffff' },
    bodyShape: 'squircle',
    scale: 1,
    eyeCount: 1,
    eyeStyle: 'round',
    outlineMode: 'none',
    aura: 'none',
  };
}

// Newborn MESP have only their random colour, with no automatic adornments.
export function simplifyDockTraits(traits) {
  return {
    ...classicDockTraits(traits),
    tuft: 'drop',
    mouth: 'none',
    brows: 'none',
    accessory: 'none',
    accessories: [],
    neck: 'none',
    back: 'none',
    held: 'none',
    spots: 'none',
    marks: 'none',
    blush: false,
    gradient: false,
    material: 'matte',
    animStyle: 'breathe',
  };
}

export function generateDockTraits(existing = [], random = Math.random) {
  const used = new Set(existing.map((traits) => traits.family));
  const available = FAMILIES.filter((family) => !used.has(family.name));
  const choices = available.length ? available : FAMILIES;
  const family = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  return simplifyDockTraits(makeTraits({ family: family.name }));
}
