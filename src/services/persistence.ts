// src/services/persistence.ts
// Persists pet positions and basic state to localStorage.

import type { PetEntity } from '../types';

const STORAGE_KEY = 'mesp-pet-state';

interface PersistedPet {
  id: string;
  position: { x: number; y: number };
  facing: 'left' | 'right';
  hue: number;
}

interface PersistedState {
  pets: PersistedPet[];
  savedAt: number;
}

export function savePetState(pets: PetEntity[]): void {
  const data: PersistedState = {
    pets: pets.map((p) => ({
      id: p.id,
      position: p.position,
      facing: p.facing,
      hue: p.hue,
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
    const data: PersistedState = JSON.parse(raw);
    // Discard if older than 7 days.
    if (Date.now() - data.savedAt > 7 * 24 * 60 * 60 * 1000) return null;
    if (!Array.isArray(data.pets) || data.pets.length === 0) return null;
    return data.pets;
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
