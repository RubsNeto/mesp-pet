// src/hooks/useInteractions.ts
// Sistema de interações: corações e perseguição de brinquedos.

import { useEffect, useRef, useState } from 'react';
import type { PetEntity } from '../types';
import type { Heart } from '../components/Hearts';
import type { ToyEntity } from '../components/Toy';

let heartCounter = 0;

export interface UseInteractionsResult {
  hearts: Heart[];
  spawnHeart: (x: number, y: number) => void;
  removeHeart: (id: number) => void;
  toys: ToyEntity[];
  spawnToy: (x: number, y: number) => void;
  removeToy: (id: string) => void;
}

export interface UseInteractionsOptions {
  pets: PetEntity[];
  movePet: (petId: string, x: number, y: number) => void;
  setPetFacing: (petId: string, facing: 'left' | 'right') => void;
  setPetState: (petId: string, state: PetEntity['state']) => void;
}

export function useInteractions({
  pets,
  movePet,
  setPetFacing,
  setPetState,
}: UseInteractionsOptions): UseInteractionsResult {
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [toys, setToys] = useState<ToyEntity[]>([]);

  const petsRef = useRef(pets);
  petsRef.current = pets;

  const spawnHeart = (x: number, y: number) => {
    heartCounter += 1;
    const id = heartCounter;
    setHearts((prev) => [...prev, { id, x, y }]);
  };

  const removeHeart = (id: number) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  };

  const spawnToy = (x: number, y: number) => {
    const id = `toy-${Date.now()}`;
    setToys((prev) => [...prev, { id, x, y }]);
  };

  const removeToy = (id: string) => {
    setToys((prev) => prev.filter((t) => t.id !== id));
  };

  // Pets perseguem brinquedos próximos.
  useEffect(() => {
    if (toys.length === 0) return;
    const id = setInterval(() => {
      petsRef.current.forEach((pet) => {
        if (pet.state === 'sleeping' || pet.state === 'sitting') return;
        if (pet.task && (pet.task.status === 'thinking' || pet.task.status === 'working')) return;

        // Encontra o brinquedo mais próximo.
        let closest: ToyEntity | null = null;
        let minDist = Infinity;
        for (const toy of toys) {
          const dx = toy.x - (pet.position.x + 64);
          const dy = toy.y - (pet.position.y + 64);
          const dist = Math.hypot(dx, dy);
          if (dist < minDist) {
            minDist = dist;
            closest = toy;
          }
        }

        if (!closest) return;
        if (minDist < 30) {
          // Tocou no brinquedo: pula de alegria e remove
          setPetState(pet.id, 'success');
          removeToy(closest.id);
          return;
        }

        // Move em direção ao brinquedo
        const dx = closest.x - (pet.position.x + 64);
        const facing: 'left' | 'right' = dx < 0 ? 'left' : 'right';
        setPetFacing(pet.id, facing);
        if (pet.state !== 'walking') setPetState(pet.id, 'walking');
        const stepX = Math.sign(dx) * 2;
        movePet(pet.id, pet.position.x + stepX, pet.position.y);
      });
    }, 100);
    return () => clearInterval(id);
  }, [toys, movePet, setPetFacing, setPetState]);

  return { hearts, spawnHeart, removeHeart, toys, spawnToy, removeToy };
}
