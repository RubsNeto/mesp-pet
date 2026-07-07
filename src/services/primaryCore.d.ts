// src/services/primaryCore.d.ts
import type { MespTraits } from '../procedural/traits';

export const PRIMARY_SCHEMA_VERSION: number;

export interface PersistedPrimary {
  version: number;
  traits: MespTraits;
  savedAt: number;
}

export function deserializeTraits(raw: unknown): MespTraits | null;
export function serializePrimary(traits: MespTraits): PersistedPrimary;
export function deserializePrimary(raw: unknown): MespTraits | null;
