// src/procedural/palette.ts
//
// Paleta centralizada do MESP. Mudar uma cor aqui afeta TODOS os sprites
// procedurais. Cada cor tem um nome semântico para facilitar manutenção.
//
// O outline é deliberadamente um azul-muito-escuro (não preto puro) para
// integrar com qualquer paleta sem ficar "duro". As cores de pé são derivadas
// das cores do corpo, mas com um leve shift para sugerir sombra.

export interface MespPalette {
  /** Contorno do corpo e detalhes faciais. */
  outline: string;
  /** Highlight do corpo (parte iluminada — usada no tufo). */
  bodyHi: string;
  /** Cor principal do corpo. */
  bodyMid: string;
  /** Sombra do corpo. */
  bodyLo: string;
  /** Cor da barriga (quando spots='belly'). */
  belly: string;
  /** Pés iluminados. */
  feetHi: string;
  /** Pés sombreados. */
  feetLo: string;
  /** Esclera (parte branca dos olhos). */
  eyeWhite: string;
  /** Pupila (igual outline na maioria dos casos). */
  pupil: string;
  /** Cor dos Z's de dormindo. */
  zzz: string;
}

export const DEFAULT_PALETTE: MespPalette = {
  outline:  '#162033',
  bodyHi:   '#b6ecff',
  bodyMid:  '#6fcfee',
  bodyLo:   '#3a8fb8',
  belly:    '#e7f7ff',
  feetHi:   '#4ea4c9',
  feetLo:   '#2c6e8c',
  eyeWhite: '#ffffff',
  pupil:    '#162033',
  zzz:      '#cdd6f4',
};
