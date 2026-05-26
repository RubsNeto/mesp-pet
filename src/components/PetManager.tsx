// src/components/PetManager.tsx
// Orquestrador principal — usa hooks extraídos para comportamento e pass-through.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PetEntity, PetState } from '../types';
import { Pet } from './Pet';
import { KiroChatPanel } from './KiroChatPanel';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { Hearts } from './Hearts';
import { Toy } from './Toy';
import { Fly } from './Fly';
import { usePassThrough } from '../hooks/usePassThrough';
import { usePetBehavior } from '../hooks/usePetBehavior';
import { useThoughts } from '../hooks/useThoughts';
import { useInteractions, useHappinessDecay } from '../hooks/useInteractions';
import { savePetState, loadPetState, clearPetState } from '../services/persistence';
import { generateTraits, DEFAULT_TRAITS } from '../procedural/traits';

let petCounter = 0;
function newPetId(): string {
  petCounter += 1;
  return `mesp-${petCounter}`;
}

interface ContextMenuStateOpen {
  open: true;
  petId: string;
  x: number;
  y: number;
}
type ContextMenuState = ContextMenuStateOpen | { open: false };

export function PetManager() {
  const [pets, setPets] = useState<PetEntity[]>(() => {
    const saved = loadPetState();
    if (saved && saved.length > 0) {
      const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const winH = typeof window !== 'undefined' ? window.innerHeight : 720;
      return saved.map((s) => {
        petCounter = Math.max(petCounter, parseInt(s.id.replace('mesp-', '')) || 0);
        const x = clamp(s.position.x, 0, Math.max(0, winW - 128));
        const y = clamp(s.position.y, 0, Math.max(0, winH - 128));
        return {
          id: s.id,
          position: { x, y },
          facing: s.facing,
          state: 'idle' as const,
          hue: s.hue,
          traits: DEFAULT_TRAITS,
          happiness: 80,
          task: null,
          history: [],
          showBubble: false,
          manualSleep: false,
          lastActivityAt: Date.now(),
        };
      });
    }
    return [createInitialPet()];
  });
  const [visibleTerminals, setVisibleTerminals] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ open: false });

  const petsRef = useRef(pets);
  petsRef.current = pets;

  // Persist state on change.
  useEffect(() => {
    savePetState(pets);
  }, [pets]);

  // Pass-through de cliques (Electron).
  usePassThrough();

  // ----- Helpers de mutação ----------------------------------------------------

  const updatePet = useCallback(
    (petId: string, patch: Partial<PetEntity> | ((p: PetEntity) => Partial<PetEntity>)) => {
      setPets((prev) =>
        prev.map((p) => {
          if (p.id !== petId) return p;
          const partial = typeof patch === 'function' ? patch(p) : patch;
          return { ...p, ...partial };
        })
      );
    },
    []
  );

  const setPetState = useCallback(
    (petId: string, state: PetState) => {
      updatePet(petId, (p) => ({
        state,
        manualSleep: state === 'sleeping' ? p.manualSleep : false,
        lastActivityAt: state === 'sleeping' ? p.lastActivityAt : Date.now(),
      }));
    },
    [updatePet]
  );

  const movePet = useCallback(
    (petId: string, x: number, y: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const clampedX = Math.max(0, Math.min(x, w - 128));
      const clampedY = Math.max(0, Math.min(y, h - 128));
      updatePet(petId, { position: { x: clampedX, y: clampedY }, lastActivityAt: Date.now() });
    },
    [updatePet]
  );

  const nudgePet = useCallback(
    (petId: string, dx: number, dy: number) => {
      const cur = petsRef.current.find((p) => p.id === petId);
      if (!cur) return;
      movePet(petId, cur.position.x + dx, cur.position.y + dy);
    },
    [movePet]
  );

  const setPetFacing = useCallback(
    (petId: string, facing: 'left' | 'right') => {
      updatePet(petId, { facing });
    },
    [updatePet]
  );

  const setHappiness = useCallback(
    (petId: string, delta: number) => {
      updatePet(petId, (p) => ({
        happiness: Math.max(0, Math.min(100, p.happiness + delta)),
      }));
    },
    [updatePet]
  );

  const scarePet = useCallback(
    (petId: string) => {
      const pet = petsRef.current.find((p) => p.id === petId);
      if (!pet) return;
      // Foge para o lado oposto do centro da tela.
      const cx = window.innerWidth / 2;
      const dx = pet.position.x < cx ? -120 : 120;
      setPetState(petId, 'error');
      movePet(petId, pet.position.x + dx, pet.position.y - 30);
      setHappiness(petId, -10);
      setTimeout(() => {
        setPetState(petId, 'idle');
      }, 1500);
    },
    [setPetState, movePet, setHappiness]
  );

  const setThought = useCallback((petId: string, text: string) => {
    updatePet(petId, { thoughtText: text });
    // Limpa após 4s (mesma duração da animação CSS).
    setTimeout(() => {
      const cur = petsRef.current.find((p) => p.id === petId);
      if (cur && cur.thoughtText === text) {
        updatePet(petId, { thoughtText: undefined });
      }
    }, 4_000);
  }, [updatePet]);

  // Auto behavior via extracted hook.
  usePetBehavior({ pets, setPetState, setPetFacing, nudgePet });

  // Thoughts aleatórios.
  useThoughts({ pets, onThought: setThought });

  // Decay de felicidade.
  useHappinessDecay(pets, setHappiness);

  // Interactions: hearts, toys, flies.
  const { hearts, spawnHeart, removeHeart, toys, spawnToy, removeToy, flies } = useInteractions({
    pets,
    setHappiness,
    movePet,
    setPetFacing,
    setPetState,
    scarePet,
  });

  const handlePetPet = useCallback(
    (petId: string, x: number, y: number) => {
      spawnHeart(x, y);
      setHappiness(petId, 2);
    },
    [spawnHeart, setHappiness]
  );

  // ----- Terminal visibility ---------------------------------------------------

  const showTerminal = useCallback((petId: string) => {
    setVisibleTerminals((prev) => {
      if (prev.has(petId)) return prev;
      const next = new Set(prev);
      next.add(petId);
      return next;
    });
  }, []);

  const hideTerminal = useCallback((petId: string) => {
    setVisibleTerminals((prev) => {
      if (!prev.has(petId)) return prev;
      const next = new Set(prev);
      next.delete(petId);
      return next;
    });
  }, []);

  const toggleTerminal = useCallback((petId: string) => {
    setVisibleTerminals((prev) => {
      const next = new Set(prev);
      if (next.has(petId)) next.delete(petId);
      else next.add(petId);
      return next;
    });
  }, []);

  // ----- Pet management --------------------------------------------------------

  const addPet = useCallback(() => {
    setPets((prev) => {
      const id = newPetId();
      const traits = generateTraits();
      const last = prev[prev.length - 1];
      const baseX = last ? last.position.x + 140 : Math.max(0, window.innerWidth / 2 - 64);
      const baseY = last ? last.position.y : Math.max(0, window.innerHeight / 2 - 64);
      const next: PetEntity = {
        id,
        position: { x: clamp(baseX, 0, window.innerWidth - 128), y: clamp(baseY, 0, window.innerHeight - 128) },
        facing: 'left',
        state: 'idle',
        hue: 0,
        traits,
        happiness: 80,
        task: null,
        history: [],
        showBubble: false,
        manualSleep: false,
        lastActivityAt: Date.now(),
      };
      return [...prev, next];
    });
  }, []);

  const removePet = useCallback((petId: string) => {
    setPets((prev) => {
      const filtered = prev.filter((p) => p.id !== petId);
      if (filtered.length === 0) return prev;
      return filtered;
    });
  }, []);

  // ----- Click handling -------------------------------------------------------

  const handlePetClick = useCallback(
    (petId: string) => {
      const pet = petsRef.current.find((p) => p.id === petId);
      if (!pet) return;
      if (pet.state === 'sleeping') {
        updatePet(petId, { state: 'idle', manualSleep: false, lastActivityAt: Date.now() });
        return;
      }
      toggleTerminal(petId);
    },
    [updatePet, toggleTerminal]
  );

  const handleBubbleClick = useCallback((petId: string) => {
    showTerminal(petId);
  }, [showTerminal]);

  const handlePetDoubleClick = useCallback(
    (petId: string) => {
      setPetState(petId, 'success');
      setHappiness(petId, 3);
      window.setTimeout(() => {
        const cur = petsRef.current.find((p) => p.id === petId);
        if (cur && cur.state === 'success') {
          setPetState(petId, 'idle');
        }
      }, 800);
    },
    [setPetState, setHappiness]
  );

  const handlePetContextMenu = useCallback((petId: string, x: number, y: number) => {
    setContextMenu({ open: true, petId, x, y });
  }, []);

  // ----- Context menu items ---------------------------------------------------

  const contextMenuItems = useMemo<Array<ContextMenuItem | 'separator'>>(() => {
    if (!contextMenu.open) return [];
    const targetId = contextMenu.petId;
    const target = pets.find((p) => p.id === targetId);
    if (!target) return [];
    return [
      { label: 'Novo MESP', icon: '✨', onClick: () => addPet() },
      {
        label: 'Dropar bolinha',
        icon: '🎾',
        onClick: () => spawnToy(contextMenu.x, contextMenu.y),
      },
      {
        label: target.state === 'sleeping' ? 'Acordar' : 'Dormir',
        icon: target.state === 'sleeping' ? '☀️' : '💤',
        onClick: () => {
          if (target.state === 'sleeping') {
            updatePet(targetId, { state: 'idle', manualSleep: false, lastActivityAt: Date.now() });
          } else {
            updatePet(targetId, { state: 'sleeping', manualSleep: true });
          }
        },
      },
      { label: 'Sentar', icon: '🪑', onClick: () => setPetState(targetId, 'sitting') },
      { label: 'Abrir painel', icon: '📋', onClick: () => showTerminal(targetId) },
      'separator',
      {
        label: 'Resetar pets',
        icon: '🔄',
        onClick: () => {
          clearPetState();
          window.location.reload();
        },
      },
      {
        label: 'Remover este MESP',
        icon: '🗑️',
        danger: true,
        disabled: pets.length <= 1,
        onClick: () => removePet(targetId),
      },
      {
        label: 'Fechar app',
        icon: '⏻',
        danger: true,
        onClick: () => {
          if (window.mesp) void window.mesp.quit();
          else window.close();
        },
      },
    ];
  }, [contextMenu, pets, addPet, removePet, setPetState, updatePet, showTerminal, spawnToy]);

  // ----- Render ---------------------------------------------------------------

  return (
    <>
      {pets.map((pet) => (
        <Pet
          key={pet.id}
          pet={pet}
          onMove={movePet}
          onClick={handlePetClick}
          onDoubleClick={handlePetDoubleClick}
          onBubbleClick={handleBubbleClick}
          onContextMenu={handlePetContextMenu}
          onPet={handlePetPet}
          onScare={scarePet}
        />
      ))}

      {toys.map((toy) => (
        <Toy key={toy.id} toy={toy} onRemove={removeToy} />
      ))}

      {flies.map((fly) => (
        <Fly key={fly.id} fly={fly} />
      ))}

      <Hearts hearts={hearts} onExpire={removeHeart} />

      {pets.map((targetPet) => (
        <KiroChatPanel
          key={targetPet.id}
          pet={targetPet}
          visible={visibleTerminals.has(targetPet.id)}
          onClose={() => hideTerminal(targetPet.id)}
          onPetStateChange={(state) => {
            setPetState(targetPet.id, state);
            // Quando CLI termina com sucesso, ganha felicidade + corações.
            if (state === 'success') {
              setHappiness(targetPet.id, 5);
              const pet = petsRef.current.find((p) => p.id === targetPet.id);
              if (pet) {
                for (let i = 0; i < 3; i++) {
                  setTimeout(() => {
                    spawnHeart(
                      pet.position.x + 64 + (Math.random() - 0.5) * 60,
                      pet.position.y + 30 + (Math.random() - 0.5) * 20,
                    );
                  }, i * 120);
                }
              }
            }
          }}
        />
      ))}

      {contextMenu.open && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu({ open: false })}
        />
      )}
    </>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createInitialPet(): PetEntity {
  const x = 16;
  const y = typeof window !== 'undefined' ? Math.max(0, window.innerHeight - 128 - 16) : 400;
  return {
    id: newPetId(),
    position: { x, y },
    facing: 'left',
    state: 'idle',
    hue: 0,
    traits: DEFAULT_TRAITS,
    happiness: 80,
    task: null,
    history: [],
    showBubble: false,
    manualSleep: false,
    lastActivityAt: Date.now(),
  };
}
