// src/procedural/palette.ts
//
// Paleta centralizada do MESP. Mudar uma cor aqui afeta TODOS os sprites
// procedurais. Cada cor tem um nome semântico para facilitar manutenção.

export interface MespPalette {
  outline: string;     // contorno escuro
  bodyHi: string;      // corpo iluminado (claro)
  bodyMid: string;     // corpo médio
  bodyLo: string;      // corpo sombra
  bellyHi: string;     // barriga clara
  feetHi: string;      // pés claro
  feetLo: string;      // pés sombra
  eyeWhite: string;    // esclera
  eyeShade: string;    // sombra dentro do olho
  pupil: string;       // pupila (mesmo do contorno)
  blush: string;       // bochecha rosada
  zzz: string;         // cor dos Z's de dormindo
}

export const DEFAULT_PALETTE: MespPalette = {
  outline:  '#0d1f2d',
  bodyHi:   '#9fe1f7',
  bodyMid:  '#5fc3eb',
  bodyLo:   '#2e8fc1',
  bellyHi:  '#d3f2fc',
  feetHi:   '#3fa3d4',
  feetLo:   '#246b94',
  eyeWhite: '#ffffff',
  eyeShade: '#cfe8ef',
  pupil:    '#0d1f2d',
  blush:    '#ff9eaf',
  zzz:      '#cdd6f4',
};
