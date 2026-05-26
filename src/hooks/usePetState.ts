// src/hooks/usePetState.ts
//
// Lógica de auto-comportamento do pet:
//   - Após N segundos sem atividade, o pet pode ir dormir (auto sleep).
//   - Em estado idle, ocasionalmente o pet pode "andar" por alguns segundos
//     antes de voltar para idle.
// Não controla cliques ou tarefas externas; isso fica no PetManager.

import { useEffect, useRef } from 'react';
import type { PetEntity, PetState } from '../types';

const AUTO_SLEEP_AFTER_MS = 60_000; // 60s sem atividade -> dorme
const RANDOM_WALK_CHANCE = 0.18; // chance a cada tick de começar a andar
const RANDOM_WALK_TICK_MS = 8000; // tick a cada 8s
const WALK_DURATION_MS = 4000;

export interface UsePetStateOptions {
  pet: PetEntity;
  onStateChange: (petId: string, state: PetState) => void;
  onPositionChange: (petId: string, dx: number, dy: number) => void;
  onFacingChange: (petId: string, facing: 'left' | 'right') => void;
  /** Desabilita o autonomous behavior (ex.: quando há uma tarefa ativa). */
  disabled?: boolean;
}

export function usePetState({
  pet,
  onStateChange,
  onPositionChange,
  onFacingChange,
  disabled = false,
}: UsePetStateOptions): void {
  const petRef = useRef(pet);
  petRef.current = pet;

  // Auto-sleep timer.
  useEffect(() => {
    if (disabled) return;
    if (pet.manualSleep) return;
    if (pet.state !== 'idle' && pet.state !== 'sitting') return;

    const id = setInterval(() => {
      const p = petRef.current;
      if (p.manualSleep) return;
      if (p.state !== 'idle' && p.state !== 'sitting') return;
      const inactiveFor = Date.now() - p.lastActivityAt;
      if (inactiveFor >= AUTO_SLEEP_AFTER_MS) {
        onStateChange(p.id, 'sleeping');
      }
    }, 5000);
    return () => clearInterval(id);
  }, [pet.id, pet.state, pet.manualSleep, disabled, onStateChange]);

  // Random walk: ocasionalmente, em idle, começa a andar para um lado.
  useEffect(() => {
    if (disabled) return;
    let walkTimeout: ReturnType<typeof setTimeout> | null = null;
    let stepInterval: ReturnType<typeof setInterval> | null = null;

    const id = setInterval(() => {
      const p = petRef.current;
      if (p.state !== 'idle') return;
      if (Math.random() > RANDOM_WALK_CHANCE) return;

      // Decide direção aleatória.
      const facing = Math.random() < 0.5 ? 'left' : 'right';
      onFacingChange(p.id, facing);
      onStateChange(p.id, 'walking');

      // Move alguns pixels durante a duração do walk.
      const dx = facing === 'left' ? -2 : 2;
      stepInterval = setInterval(() => {
        onPositionChange(p.id, dx, 0);
      }, 80);

      walkTimeout = setTimeout(() => {
        if (stepInterval) clearInterval(stepInterval);
        stepInterval = null;
        // Volta para idle se ainda estiver caminhando (não foi interrompido).
        const cur = petRef.current;
        if (cur.state === 'walking') {
          onStateChange(cur.id, 'idle');
        }
      }, WALK_DURATION_MS);
    }, RANDOM_WALK_TICK_MS);

    return () => {
      clearInterval(id);
      if (walkTimeout) clearTimeout(walkTimeout);
      if (stepInterval) clearInterval(stepInterval);
    };
  }, [pet.id, disabled, onStateChange, onPositionChange, onFacingChange]);
}
