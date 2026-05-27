// src/services/persistence.ts
//
// Persiste posição e variação visual (traits) dos pets no localStorage.
// Inclui número de versão para permitir migração futura, e timestamp para
// expirar entradas muito antigas.

import type { PetEntity } from '../types';
import type { MespTraits } from '../procedural/traits';
import { deserializeTraits } from '../procedural/traits';

const STORAGE_KEY = 'mesp-pet-state';
const SCHEMA_VERSION = 2;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export interface PersistedPet {
  id: string;
  position: { x: number; y: number };
  facing: 'left' | 'right';
  /** Traits visuais (opcional para compat com versões antigas). */
  traits?: MespTraits;
}

interface PersistedState {
  /** Versão do schema — incrementar quando o formato mudar. */
  version: number;
  pets: PersistedPet[];
  savedAt: number;
}

export function savePetState(pets: PetEntity[]): void {
  const data: PersistedState = {
    version: SCHEMA_VERSION,
    pets: pets.map((p) => ({
      id: p.id,
      position: p.position,
      facing: p.facing,
      traits: p.traits,
    })),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — ignore.
  }
}

export function loadPetState(): PersistedPet[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedState>;
    if (!data || typeof data !== 'object') return null;
    if (Array.isArray((data as PersistedState).pets) === false) return null;

    const savedAt = typeof data.savedAt === 'number' ? data.savedAt : 0;
    if (Date.now() - savedAt > MAX_AGE_MS) return null;

    const pets = (data.pets ?? [])
      .map<PersistedPet | null>((p) => {
        if (!p || typeof p !== 'object') return null;
        if (typeof p.id !== 'string') return null;
        if (!p.position || typeof p.position.x !== 'number' || typeof p.position.y !== 'number') {
          return null;
        }
        const facing = p.facing === 'right' ? 'right' : 'left';
        const traits = deserializeTraits(p.traits) ?? undefined;
        return {
          id: p.id,
          position: { x: p.position.x, y: p.position.y },
          facing,
          traits,
        };
      })
      .filter((x): x is PersistedPet => x !== null);

    if (pets.length === 0) return null;
    return pets;
  } catch {
    return null;
  }
}

export function clearPetState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
