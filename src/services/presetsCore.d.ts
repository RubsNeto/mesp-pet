// src/services/presetsCore.d.ts
import type { MespTraits } from '../procedural/traits';

export const PRESETS_SCHEMA_VERSION: number;

export interface MespPreset {
  id: string;
  name: string;
  traits: MespTraits;
  createdAt: number;
}

export interface PresetLibrary {
  presets: MespPreset[];
  primaryId: string | null;
}

export function makePreset(name: string, traits: MespTraits): MespPreset;
export function addPreset(list: MespPreset[], name: string, traits: MespTraits): MespPreset[];
export function removePreset(list: MespPreset[], id: string): MespPreset[];
export function renamePreset(list: MespPreset[], id: string, name: string): MespPreset[];
export function updatePresetTraits(list: MespPreset[], id: string, traits: MespTraits): MespPreset[];
export function normalizePresets(raw: unknown): MespPreset[];
export function deserializeLibrary(raw: unknown): PresetLibrary;
export function serializeLibrary(presets: MespPreset[], primaryId: string | null): {
  version: number;
  presets: MespPreset[];
  primaryId: string | null;
};
