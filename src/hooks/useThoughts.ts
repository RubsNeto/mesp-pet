// src/hooks/useThoughts.ts
// Generates random thought bubbles for pets periodically.

import { useEffect, useRef } from 'react';
import type { PetEntity } from '../types';

const THOUGHTS = [
  'oi! 👋',
  'que tédio…',
  'vamos brincar?',
  'me coça aí 🥺',
  '... pensando ...',
  'olha só!',
  'humm',
  'estou aqui!',
  'oi humano',
  'é hora de café? ☕',
  'estou trabalhando 💻',
  'cliques rápidos me assustam!',
  'gosto quando você me acaricia',
  'vou dormir um pouco zzz',
  'kiro é incrível!',
];

const MORNING_THOUGHTS = ['bom dia! ☀️', 'que sono…', 'café?'];
const EVENING_THOUGHTS = ['boa noite 🌙', 'já está tarde…', 'que dia longo'];

function pickThought(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9 && Math.random() < 0.4) {
    return MORNING_THOUGHTS[Math.floor(Math.random() * MORNING_THOUGHTS.length)]!;
  }
  if (hour >= 21 && Math.random() < 0.4) {
    return EVENING_THOUGHTS[Math.floor(Math.random() * EVENING_THOUGHTS.length)]!;
  }
  return THOUGHTS[Math.floor(Math.random() * THOUGHTS.length)]!;
}

interface UseThoughtsOptions {
  pets: PetEntity[];
  onThought: (petId: string, text: string) => void;
  /** Min ms between thoughts per pet (default 30s). */
  minIntervalMs?: number;
  /** Max ms between thoughts per pet (default 90s). */
  maxIntervalMs?: number;
}

export function useThoughts({
  pets,
  onThought,
  minIntervalMs = 30_000,
  maxIntervalMs = 90_000,
}: UseThoughtsOptions): void {
  const petsRef = useRef(pets);
  petsRef.current = pets;
  const onThoughtRef = useRef(onThought);
  onThoughtRef.current = onThought;

  useEffect(() => {
    const tick = setInterval(() => {
      petsRef.current.forEach((p) => {
        if (p.state === 'sleeping') return;
        if (p.state === 'thinking' || p.state === 'working') return;
        // 25% chance per tick.
        if (Math.random() > 0.25) return;
        onThoughtRef.current(p.id, pickThought());
      });
    }, minIntervalMs);
    return () => clearInterval(tick);
    // We pass minIntervalMs as the tick rate; maxIntervalMs ignored for simplicity.
  }, [minIntervalMs, maxIntervalMs]);
}
