// src/hooks/usePetBehavior.ts
// Auto-sleep + random walk behavior extracted from PetManager.
// Tracks all spawned intervals/timeouts so they're cleaned on unmount.

import { useEffect, useRef } from 'react';
import type { PetEntity, PetState } from '../types';

interface UsePetBehaviorOptions {
  pets: PetEntity[];
  setPetState: (petId: string, state: PetState) => void;
  setPetFacing: (petId: string, facing: 'left' | 'right') => void;
  nudgePet: (petId: string, dx: number, dy: number) => void;
}

export function usePetBehavior({ pets, setPetState, setPetFacing, nudgePet }: UsePetBehaviorOptions): void {
  const petsRef = useRef(pets);
  petsRef.current = pets;

  // Auto-sleep after 60s of inactivity.
  useEffect(() => {
    const sleepTimer = setInterval(() => {
      const now = Date.now();
      petsRef.current.forEach((p) => {
        if (p.manualSleep) return;
        if (p.state !== 'idle' && p.state !== 'sitting') return;
        if (p.task && (p.task.status === 'thinking' || p.task.status === 'working')) return;
        if (now - p.lastActivityAt > 60_000) {
          setPetState(p.id, 'sleeping');
        }
      });
    }, 5000);
    return () => clearInterval(sleepTimer);
  }, [setPetState]);

  // Random behaviors: walk, sit, jump.
  // IMPORTANTE: rastreamos todos os intervals/timeouts criados aqui para
  // limp\u00e1-los no unmount, evitando memory leaks.
  useEffect(() => {
    const activeIntervals = new Set<ReturnType<typeof setInterval>>();
    const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

    const trackInterval = (id: ReturnType<typeof setInterval>) => {
      activeIntervals.add(id);
      return id;
    };
    const trackTimeout = (cb: () => void, ms: number) => {
      const id = setTimeout(() => {
        activeTimeouts.delete(id);
        cb();
      }, ms);
      activeTimeouts.add(id);
      return id;
    };

    const behaviorTimer = setInterval(() => {
      petsRef.current.forEach((p) => {
        if (p.state !== 'idle') return;
        if (p.task && (p.task.status === 'thinking' || p.task.status === 'working')) return;

        const roll = Math.random();

        if (roll < 0.18) {
          const facing = Math.random() < 0.5 ? 'left' : 'right';
          setPetFacing(p.id, facing);
          setPetState(p.id, 'walking');
          const dx = facing === 'left' ? -1 : 1;
          const stepInterval = trackInterval(
            setInterval(() => {
              nudgePet(p.id, dx, 0);
            }, 110),
          );
          trackTimeout(() => {
            clearInterval(stepInterval);
            activeIntervals.delete(stepInterval);
            const cur = petsRef.current.find((x) => x.id === p.id);
            if (cur && cur.state === 'walking') {
              setPetState(p.id, 'idle');
            }
          }, 2000 + Math.random() * 2500);
          return;
        }

        if (roll < 0.24) {
          setPetState(p.id, 'sitting');
          trackTimeout(() => {
            const cur = petsRef.current.find((x) => x.id === p.id);
            if (cur && cur.state === 'sitting' && !cur.manualSleep) {
              setPetState(p.id, 'idle');
            }
          }, 4000 + Math.random() * 3000);
          return;
        }

        if (roll < 0.28) {
          setPetState(p.id, 'success');
          trackTimeout(() => {
            const cur = petsRef.current.find((x) => x.id === p.id);
            if (cur && cur.state === 'success') {
              setPetState(p.id, 'idle');
            }
          }, 800);
          return;
        }
      });
    }, 8000);

    return () => {
      clearInterval(behaviorTimer);
      activeIntervals.forEach(clearInterval);
      activeTimeouts.forEach(clearTimeout);
      activeIntervals.clear();
      activeTimeouts.clear();
    };
  }, [nudgePet, setPetFacing, setPetState]);
}
