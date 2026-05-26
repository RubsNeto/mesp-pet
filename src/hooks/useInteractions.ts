// src/hooks/useInteractions.ts
// Sistema de interações: corações, sustos, perseguição de brinquedos/moscas.

import { useEffect, useRef, useState } from 'react';
import type { PetEntity } from '../types';
import type { Heart } from '../components/Hearts';
import type { ToyEntity } from '../components/Toy';
import type { FlyEntity } from '../components/Fly';

let heartCounter = 0;
let flyCounter = 0;

export interface UseInteractionsResult {
  hearts: Heart[];
  spawnHeart: (x: number, y: number) => void;
  removeHeart: (id: number) => void;
  toys: ToyEntity[];
  spawnToy: (x: number, y: number) => void;
  removeToy: (id: string) => void;
  flies: FlyEntity[];
}

export interface UseInteractionsOptions {
  pets: PetEntity[];
  setHappiness: (petId: string, delta: number) => void;
  movePet: (petId: string, x: number, y: number) => void;
  setPetFacing: (petId: string, facing: 'left' | 'right') => void;
  setPetState: (petId: string, state: PetEntity['state']) => void;
  scarePet: (petId: string) => void;
}

export function useInteractions({
  pets,
  setHappiness,
  movePet,
  setPetFacing,
  setPetState,
}: UseInteractionsOptions): UseInteractionsResult {
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [toys, setToys] = useState<ToyEntity[]>([]);
  const [flies, setFlies] = useState<FlyEntity[]>([]);

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
          setHappiness(pet.id, 5);
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
  }, [toys, movePet, setPetFacing, setPetState, setHappiness]);

  // Spawn aleatório de moscas.
  useEffect(() => {
    const id = setInterval(() => {
      // 15% chance a cada 20s
      if (Math.random() > 0.15) return;
      if (flies.length >= 2) return;
      flyCounter += 1;
      const newFly: FlyEntity = {
        id: `fly-${flyCounter}`,
        x: Math.random() * (window.innerWidth - 32),
        y: Math.random() * (window.innerHeight - 32),
      };
      setFlies((prev) => [...prev, newFly]);
    }, 20_000);
    return () => clearInterval(id);
  }, [flies.length]);

  // Movimento aleatório das moscas + remoção depois de 8s.
  useEffect(() => {
    if (flies.length === 0) return;
    const moveTimer = setInterval(() => {
      setFlies((prev) =>
        prev.map((f) => ({
          ...f,
          x: Math.max(0, Math.min(window.innerWidth - 32, f.x + (Math.random() - 0.5) * 30)),
          y: Math.max(0, Math.min(window.innerHeight - 32, f.y + (Math.random() - 0.5) * 30)),
        })),
      );
    }, 200);

    const cleanupTimers = flies.map((fly) =>
      setTimeout(() => {
        setFlies((prev) => prev.filter((f) => f.id !== fly.id));
      }, 8_000),
    );

    return () => {
      clearInterval(moveTimer);
      cleanupTimers.forEach(clearTimeout);
    };
  }, [flies]);

  // Pet caça moscas próximas.
  useEffect(() => {
    if (flies.length === 0) return;
    const id = setInterval(() => {
      petsRef.current.forEach((pet) => {
        if (pet.state === 'sleeping' || pet.state === 'sitting') return;
        if (pet.task && (pet.task.status === 'thinking' || pet.task.status === 'working')) return;

        let closest: FlyEntity | null = null;
        let minDist = Infinity;
        for (const fly of flies) {
          const dx = fly.x - (pet.position.x + 64);
          const dy = fly.y - (pet.position.y + 64);
          const dist = Math.hypot(dx, dy);
          if (dist < minDist) {
            minDist = dist;
            closest = fly;
          }
        }

        if (!closest) return;
        // Só persegue se a mosca estiver razoavelmente perto
        if (minDist > 250) return;
        if (minDist < 40) {
          // Pegou! Remove a mosca, pula de alegria
          setPetState(pet.id, 'success');
          setHappiness(pet.id, 3);
          setFlies((prev) => prev.filter((f) => f.id !== closest!.id));
          return;
        }

        const dx = closest.x - (pet.position.x + 64);
        const facing: 'left' | 'right' = dx < 0 ? 'left' : 'right';
        setPetFacing(pet.id, facing);
        if (pet.state !== 'walking') setPetState(pet.id, 'walking');
        const stepX = Math.sign(dx) * 1.5;
        movePet(pet.id, pet.position.x + stepX, pet.position.y);
      });
    }, 150);
    return () => clearInterval(id);
  }, [flies, movePet, setPetFacing, setPetState, setHappiness]);

  return { hearts, spawnHeart, removeHeart, toys, spawnToy, removeToy, flies };
}

// Decay de felicidade ao longo do tempo.
export function useHappinessDecay(
  pets: PetEntity[],
  setHappiness: (petId: string, delta: number) => void,
): void {
  const petsRef = useRef(pets);
  petsRef.current = pets;
  const setRef = useRef(setHappiness);
  setRef.current = setHappiness;

  useEffect(() => {
    const id = setInterval(() => {
      petsRef.current.forEach((p) => {
        // -1 de felicidade a cada 30s.
        setRef.current(p.id, -1);
      });
    }, 30_000);
    return () => clearInterval(id);
  }, []);
}
