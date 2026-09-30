import type { MespTraits } from './traits';

export function simplifyDockTraits(traits: MespTraits): MespTraits;
export function classicDockTraits(traits: MespTraits): MespTraits;
export function generateDockTraits(
  existing?: readonly Pick<MespTraits, 'family'>[],
  random?: () => number,
): MespTraits;
