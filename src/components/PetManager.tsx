// src/components/PetManager.tsx
// src/components/PetManager.tsx
//
// Orquestrador principal. Mantém a lista de pets, seus estados, tarefas e
// histórico de execuções. Renderiza:
//   - todos os Pets
//   - KiroChatPanel: aberto ao clicar no pet/balão; permite digitar tarefas e
//     ver a saída da Kiro CLI em streaming
//   - menu de contexto (clique direito)
//   - painel de MockControls (canto inferior direito)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PetEntity, PetState } from '../types';
import { Pet } from './Pet';
import { KiroChatPanel } from './KiroChatPanel';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

const PET_HUE_PALETTE = [0, 45, 90, 150, 200, 260, 310];

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
  const [pets, setPets] = useState<PetEntity[]>(() => [createInitialPet()]);
  const [visibleTerminals, setVisibleTerminals] = useState<Set<string>>(() => new Set());

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
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ open: false });
  const [, setKiroCommand] = useState<string>('kiro');

  const petsRef = useRef(pets);
  petsRef.current = pets;

  // Carrega configuração do .env (vinda do main process via IPC).
  useEffect(() => {
    if (!window.mesp?.getConfig) return;
    void window.mesp.getConfig().then((cfg) => {
      if (cfg.kiroCommand) setKiroCommand(cfg.kiroCommand);
    });
  }, []);

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

  const addPet = useCallback(() => {
    setPets((prev) => {
      const id = newPetId();
      const hue = PET_HUE_PALETTE[prev.length % PET_HUE_PALETTE.length] ?? 0;
      // Posição: deslocada do último pet ou no centro.
      const last = prev[prev.length - 1];
      const baseX = last ? last.position.x + 140 : Math.max(0, window.innerWidth / 2 - 64);
      const baseY = last ? last.position.y : Math.max(0, window.innerHeight / 2 - 64);
      const next: PetEntity = {
        id,
        position: { x: clamp(baseX, 0, window.innerWidth - 128), y: clamp(baseY, 0, window.innerHeight - 128) },
        facing: 'left',
        state: 'idle',
        hue,
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
      // Garante pelo menos 1 pet.
      if (filtered.length === 0) return prev;
      return filtered;
    });
  }, []);

  // ----- Auto behavior (timers) -----------------------------------------------

  // Auto-sleep + random walk diretamente aqui (em vez de hook por pet, evita
  // re-render caótico e gargalos para 1+ pets).
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

  useEffect(() => {
    // Tick mais frequente, com rolls múltiplos por evento.
    const behaviorTimer = setInterval(() => {
      petsRef.current.forEach((p) => {
        if (p.state !== 'idle') return;
        if (p.task && (p.task.status === 'thinking' || p.task.status === 'working')) return;

        const roll = Math.random();

        // 18% — caminhada curta para um lado.
        if (roll < 0.18) {
          const facing = Math.random() < 0.5 ? 'left' : 'right';
          setPetFacing(p.id, facing);
          setPetState(p.id, 'walking');
          const dx = facing === 'left' ? -1 : 1;
          const stepInterval = setInterval(() => {
            nudgePet(p.id, dx, 0);
          }, 110);
          setTimeout(() => {
            clearInterval(stepInterval);
            const cur = petsRef.current.find((x) => x.id === p.id);
            if (cur && cur.state === 'walking') {
              setPetState(p.id, 'idle');
            }
          }, 2000 + Math.random() * 2500); // 2–4.5s caminhando
          return;
        }

        // 6% — senta um instante (pet pensativo).
        if (roll < 0.24) {
          setPetState(p.id, 'sitting');
          setTimeout(() => {
            const cur = petsRef.current.find((x) => x.id === p.id);
            if (cur && cur.state === 'sitting' && !cur.manualSleep) {
              setPetState(p.id, 'idle');
            }
          }, 4000 + Math.random() * 3000); // 4–7s sentado
          return;
        }

        // 4% — pulinho espontâneo de alegria (success momentâneo).
        if (roll < 0.28) {
          setPetState(p.id, 'success');
          setTimeout(() => {
            const cur = petsRef.current.find((x) => x.id === p.id);
            if (cur && cur.state === 'success') {
              setPetState(p.id, 'idle');
            }
          }, 800);
          return;
        }
      });
    }, 8000);
    return () => clearInterval(behaviorTimer);
  }, [nudgePet, setPetFacing, setPetState]);

  // ----- Click handling -------------------------------------------------------

  const handlePetClick = useCallback(
    (petId: string) => {
      const pet = petsRef.current.find((p) => p.id === petId);
      if (!pet) return;
      // Se está dormindo, "acorda" ao clicar.
      if (pet.state === 'sleeping') {
        updatePet(petId, {
          state: 'idle',
          manualSleep: false,
          lastActivityAt: Date.now(),
        });
        return;
      }
      // Click no pet alterna a visibilidade do terminal (mostra/esconde).
      // O processo PTY já está rodando junto com o pet — nunca recriamos.
      toggleTerminal(petId);
    },
    [updatePet, toggleTerminal]
  );

  const handleBubbleClick = useCallback((petId: string) => {
    showTerminal(petId);
  }, [showTerminal]);

  const handlePetDoubleClick = useCallback(
    (petId: string) => {
      // Ativa state 'success' momentâneo para mostrar sprite de pulo +
      // animação CSS pet-jump combinando com o pet-bounce.
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

  // ----- Pass-through de cliques (Electron) -----------------------------------

  // Quando o mouse passa sobre um elemento interativo, pedimos ao Electron para
  // capturar cliques. Nas demais áreas a janela "transparente" repassa cliques
  // ao desktop (setIgnoreMouseEvents(true, { forward: true })).
  useEffect(() => {
    if (!window.mesp) return; // browser puro: não há janela transparente.
    let captured = false;
    let pendingTarget: EventTarget | null = null;
    let rafId = 0;

    const setCapture = (capture: boolean) => {
      if (capture === captured) return;
      captured = capture;
      void window.mesp!.setIgnoreMouseEvents(!capture, true);
    };

    function isOverInteractive(target: EventTarget | null): boolean {
      let node: Node | null = target as Node | null;
      while (node && node !== document.body) {
        if (node instanceof HTMLElement && node.classList.contains('interactive')) {
          return true;
        }
        node = node.parentNode;
      }
      return false;
    }

    function flush() {
      rafId = 0;
      setCapture(isOverInteractive(pendingTarget));
    }

    function onMouseMove(e: MouseEvent) {
      pendingTarget = e.target;
      if (rafId) return;
      rafId = requestAnimationFrame(flush);
    }
    function onMouseOut(e: MouseEvent) {
      if (!e.relatedTarget) setCapture(false);
    }

    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseout', onMouseOut);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseout', onMouseOut);
    };
  }, []);

  // ----- Context menu items ---------------------------------------------------

  const contextMenuItems = useMemo<Array<ContextMenuItem | 'separator'>>(() => {
    if (!contextMenu.open) return [];
    const targetId = contextMenu.petId;
    const target = pets.find((p) => p.id === targetId);
    if (!target) return [];
    return [
      {
        label: 'Novo MESP',
        icon: '✨',
        onClick: () => addPet(),
      },
      {
        label: target.state === 'sleeping' ? 'Acordar' : 'Dormir',
        icon: target.state === 'sleeping' ? '☀️' : '💤',
        onClick: () => {
          if (target.state === 'sleeping') {
            updatePet(targetId, {
              state: 'idle',
              manualSleep: false,
              lastActivityAt: Date.now(),
            });
          } else {
            updatePet(targetId, { state: 'sleeping', manualSleep: true });
          }
        },
      },
      {
        label: 'Sentar',
        icon: '🪑',
        onClick: () => setPetState(targetId, 'sitting'),
      },
      {
        label: 'Abrir painel',
        icon: '📋',
        onClick: () => showTerminal(targetId),
      },
      {
        label: 'Esconder balão',
        icon: '🙊',
        disabled: !target.showBubble,
        onClick: () => updatePet(targetId, { showBubble: false }),
      },
      'separator',
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
          if (window.mesp) {
            void window.mesp.quit();
          } else {
            window.close();
          }
        },
      },
    ];
  }, [contextMenu, pets, addPet, removePet, setPetState, updatePet, showTerminal]);

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
        />
      ))}

      {pets.map((targetPet) => (
          <KiroChatPanel
            key={targetPet.id}
            pet={targetPet}
            visible={visibleTerminals.has(targetPet.id)}
            onClose={() => hideTerminal(targetPet.id)}
            onPetStateChange={(state) => setPetState(targetPet.id, state)}
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

// --- Helpers ----------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createInitialPet(): PetEntity {
  // Canto inferior esquerdo, acima da taskbar (~60px de margem do bottom).
  const x = 16;
  const y = typeof window !== 'undefined' ? Math.max(0, window.innerHeight - 128 - 16) : 400;
  return {
    id: newPetId(),
    position: { x, y },
    facing: 'left',
    state: 'idle',
    hue: 0,
    task: null,
    history: [],
    showBubble: false,
    manualSleep: false,
    lastActivityAt: Date.now(),
  };
}
