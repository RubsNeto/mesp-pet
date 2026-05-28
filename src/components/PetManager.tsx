// src/components/PetManager.tsx
// Orquestrador principal — usa hooks extraídos para comportamento e pass-through.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PetEntity, PetState } from '../types';
import { Pet } from './Pet';
import { KiroChatPanel } from './KiroChatPanel';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { Hearts } from './Hearts';
import { Toy } from './Toy';
import { usePassThrough } from '../hooks/usePassThrough';
import { usePetBehavior } from '../hooks/usePetBehavior';
import { useInteractions } from '../hooks/useInteractions';
import { savePetState, loadPetState, clearPetState } from '../services/persistence';
import { generateTraits, DEFAULT_TRAITS } from '../procedural/traits';

// Limite máximo de pets simultâneos para evitar uso descontrolado de memória.
// 10 é mais que suficiente pra brincar; cada pet ocupa ~1MB com sprites cacheados.
const MAX_PETS = 10;

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
      // Limita o que vem da persistência ao máximo configurado, defesa contra
      // localStorage com gente demais por algum motivo.
      return saved.slice(0, MAX_PETS).map((s) => {
        petCounter = Math.max(petCounter, parseInt(s.id.replace('mesp-', '')) || 0);
        const x = clamp(s.position.x, 0, Math.max(0, winW - 128));
        const y = clamp(s.position.y, 0, Math.max(0, winH - 128));
        return {
          id: s.id,
          position: { x, y },
          facing: s.facing,
          state: 'idle' as const,
          // Restaura traits salvos; se vier de schema antigo, usa default.
          traits: s.traits ?? DEFAULT_TRAITS,
          task: null,
          history: [],
          showBubble: false,
          manualSleep: false,
          lastActivityAt: Date.now(),
          workDir: s.workDir ?? null,
        };
      });
    }
    return [createInitialPet()];
  });
  const [visibleTerminals, setVisibleTerminals] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ open: false });
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);

  // Carrega estado atual do auto-start.
  useEffect(() => {
    if (!window.mesp?.getAutoStart) return;
    void window.mesp.getAutoStart().then((enabled) => {
      setAutoStartEnabled(enabled);
    });
  }, []);

  const toggleAutoStart = useCallback(() => {
    if (!window.mesp?.setAutoStart) return;
    void window.mesp.setAutoStart(!autoStartEnabled).then((newState) => {
      setAutoStartEnabled(newState);
    });
  }, [autoStartEnabled]);

  const petsRef = useRef(pets);
  petsRef.current = pets;

  // Persist state on change (debounced para evitar grava\u00e7\u00f5es excessivas no drag).
  useEffect(() => {
    const t = setTimeout(() => {
      savePetState(pets);
    }, 500);
    return () => clearTimeout(t);
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

  const scarePet = useCallback(
    (petId: string) => {
      const pet = petsRef.current.find((p) => p.id === petId);
      if (!pet) return;
      const cx = window.innerWidth / 2;
      const dx = pet.position.x < cx ? -120 : 120;
      setPetState(petId, 'error');
      movePet(petId, pet.position.x + dx, pet.position.y - 30);
      setTimeout(() => {
        setPetState(petId, 'idle');
      }, 1500);
    },
    [setPetState, movePet]
  );

  // Auto behavior via extracted hook.
  usePetBehavior({ pets, setPetState, setPetFacing, nudgePet });

  // Interactions: hearts e toys.
  const { hearts, spawnHeart, removeHeart, toys, spawnToy, removeToy } = useInteractions({
    pets,
    movePet,
    setPetFacing,
    setPetState,
  });

  const handlePetPet = useCallback(
    (_petId: string, x: number, y: number) => {
      spawnHeart(x, y);
    },
    [spawnHeart]
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
      if (prev.length >= MAX_PETS) return prev;
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
        traits,
        task: null,
        history: [],
        showBubble: false,
        manualSleep: false,
        lastActivityAt: Date.now(),
        workDir: null,
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
      window.setTimeout(() => {
        const cur = petsRef.current.find((p) => p.id === petId);
        if (cur && cur.state === 'success') {
          setPetState(petId, 'idle');
        }
      }, 800);
    },
    [setPetState]
  );

  const handlePetContextMenu = useCallback((petId: string, x: number, y: number) => {
    setContextMenu({ open: true, petId, x, y });
  }, []);

  const chooseWorkDir = useCallback(
    (petId: string) => {
      if (!window.mesp?.selectFolder) return;
      const current = petsRef.current.find((p) => p.id === petId);
      void window.mesp.selectFolder(current?.workDir ?? undefined).then((folder) => {
        if (!folder) return;
        updatePet(petId, { workDir: folder, lastActivityAt: Date.now() });
        // Garante que o terminal está visível pra usuário ver o respawn.
        showTerminal(petId);
      });
    },
    [updatePet, showTerminal],
  );

  // ----- Context menu items ---------------------------------------------------

  const contextMenuItems = useMemo<Array<ContextMenuItem | 'separator'>>(() => {
    if (!contextMenu.open) return [];
    const targetId = contextMenu.petId;
    const target = pets.find((p) => p.id === targetId);
    if (!target) return [];
    return [
      { label: 'Novo MESP', icon: '✨', disabled: pets.length >= MAX_PETS, onClick: () => addPet() },
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
      {
        label: target.workDir ? `Pasta: ${shortenPath(target.workDir)}` : 'Pasta de trabalho…',
        icon: '📁',
        onClick: () => chooseWorkDir(targetId),
      },
      'separator',
      {
        label: autoStartEnabled ? 'Não iniciar com o sistema' : 'Iniciar com o sistema',
        icon: autoStartEnabled ? '🟢' : '⚪',
        onClick: toggleAutoStart,
      },
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
  }, [contextMenu, pets, addPet, removePet, setPetState, updatePet, showTerminal, spawnToy, autoStartEnabled, toggleAutoStart, chooseWorkDir]);

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

      <Hearts hearts={hearts} onExpire={removeHeart} />

      {pets.map((targetPet) => (
        <KiroChatPanel
          key={targetPet.id}
          pet={targetPet}
          visible={visibleTerminals.has(targetPet.id)}
          onClose={() => hideTerminal(targetPet.id)}
          onPetStateChange={(state) => {
            setPetState(targetPet.id, state);
            // Quando CLI termina com sucesso, gera corações.
            if (state === 'success') {
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

function shortenPath(p: string): string {
  // Mostra só o nome da pasta + pai, pra não estourar a largura do menu.
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = norm.split('/');
  if (parts.length <= 2) return norm;
  return `…/${parts.slice(-2).join('/')}`;
}

function createInitialPet(): PetEntity {
  const x = 16;
  const y = typeof window !== 'undefined' ? Math.max(0, window.innerHeight - 128 - 16) : 400;
  return {
    id: newPetId(),
    position: { x, y },
    facing: 'left',
    state: 'idle',
    traits: DEFAULT_TRAITS,
    task: null,
    history: [],
    showBubble: false,
    manualSleep: false,
    lastActivityAt: Date.now(),
    workDir: null,
  };
}
