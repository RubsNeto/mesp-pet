// src/components/Pet.tsx
//
// Renderiza um único pet:
//   - sprite atual (animação cíclica)
//   - sombra
//   - balão de fala (SpeechBubble)
//   - pupila que segue o cursor (atualizada via ref imperativamente)
//   - tratamento de drag, click e contextmenu
//
// Performance: a pupila é atualizada via ref direto no DOM (sem React state),
// e o componente é memoizado para evitar re-renders quando outros pets mudam.

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SPRITE_FLIPS_ON_RIGHT, SPRITE_EYE, getSpritesForTraits } from '../assets/sprites';
import { usePetAnimation } from '../hooks/usePetAnimation';
import { subscribeMousePosition } from '../hooks/useMousePosition';
import type { PetEntity } from '../types';
import { SpeechBubble } from './SpeechBubble';

export interface PetProps {
  pet: PetEntity;
  onMove: (petId: string, x: number, y: number) => void;
  onClick: (petId: string) => void;
  onDoubleClick?: (petId: string) => void;
  onBubbleClick: (petId: string) => void;
  onContextMenu: (petId: string, x: number, y: number) => void;
  /** Callback ao acariciar (clique e segurar) — gera coração e ganha felicidade. */
  onPet?: (petId: string, x: number, y: number) => void;
  /** Callback quando o usuário clica rápido várias vezes (susto). */
  onScare?: (petId: string) => void;
}

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

function PetComponent({ pet, onMove, onClick, onDoubleClick, onBubbleClick, onContextMenu, onPet, onScare }: PetProps) {
  const { frame } = usePetAnimation(pet.state, pet.traits);
  const spriteSet = pet.traits ? getSpritesForTraits(pet.traits) : null;
  const flipsMap = spriteSet?.flips ?? SPRITE_FLIPS_ON_RIGHT;
  const eyeMap = spriteSet?.eye ?? SPRITE_EYE;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const pupilRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [spawning, setSpawning] = useState(true);
  const dragRef = useRef<DragState | null>(null);
  const movedRef = useRef(false);
  const lastClickAtRef = useRef(0);

  // Detecção de carinho (hold).
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef(0);

  // Detecção de cliques rápidos (susto).
  const recentClicksRef = useRef<number[]>([]);

  const flipX = (flipsMap[frame] ?? false) && pet.facing === 'right';
  const eye = eyeMap[frame] ?? null;

  // Refs sempre atualizados — usados pelo subscribe do mouse.
  const eyeRef = useRef(eye);
  const posRef = useRef(pet.position);
  const flipRef = useRef(flipX);
  useLayoutEffect(() => {
    eyeRef.current = eye;
    posRef.current = pet.position;
    flipRef.current = flipX;
  }, [eye, pet.position, flipX]);

  // Subscribe ao mouse e atualiza a pupila imperativamente.
  // ZERO re-renders do React causados por movimento do mouse.
  useEffect(() => {
    if (!eye) return; // sem olho, sem subscribe
    // Layout: wrapper 128x128 contém tilt 96x96 centralizado horizontalmente
    // e alinhado pelo bottom (devido ao flex column justify-end items-center).
    // Tilt offset dentro do wrapper: x = (128-96)/2 = 16, y = 128-96 = 32.
    const TILT_W = 96;
    const TILT_X_OFFSET = 16;
    const TILT_Y_OFFSET = 32;

    const update = (mx: number, my: number) => {
      const e = eyeRef.current;
      const p = pupilRef.current;
      if (!e || !p) return;

      // Quando o sprite está flipado (andando para a direita), o olho aparece
      // em (TILT_W - cx) dentro do tilt. Ajustamos cx para a posição visual.
      const flipped = flipRef.current;
      const visualCx = flipped ? TILT_W - e.cx : e.cx;

      const eyeWorldX = posRef.current.x + TILT_X_OFFSET + visualCx;
      const eyeWorldY = posRef.current.y + TILT_Y_OFFSET + e.cy;
      let dx = mx - eyeWorldX;
      let dy = my - eyeWorldY;
      const dist = Math.hypot(dx, dy);
      const factor = dist > 0 ? Math.min(1, dist / 80) : 0;
      if (dist > 0) {
        dx = (dx / dist) * factor;
        dy = (dy / dist) * factor;
      } else {
        dx = 0;
        dy = 0;
      }
      let offX = dx * e.rx;
      let offY = dy * e.ry;
      if (e.rx > 0 && e.ry > 0) {
        const t = Math.hypot(offX / e.rx, offY / e.ry);
        if (t > 1) {
          offX /= t;
          offY /= t;
        }
      }
      const left = visualCx + offX - e.size / 2;
      const top = e.cy + offY - e.size / 2;
      p.style.left = `${left}px`;
      p.style.top = `${top}px`;
    };
    return subscribeMousePosition(update);
  }, [eye]);

  // Head tilt: sutil rotação do corpo na direção do cursor quando ele está
  // próximo. Não causa re-render — atualiza CSS variable diretamente no wrapper.
  useEffect(() => {
    const update = (mx: number, my: number) => {
      const t = tiltRef.current;
      if (!t) return;
      const centerX = posRef.current.x + 64;
      const centerY = posRef.current.y + 64;
      const dx = mx - centerX;
      const dy = my - centerY;
      const dist = Math.hypot(dx, dy);
      // Só inclina se o mouse está numa zona "pessoal" (até 200px).
      if (dist > 200 || dist < 1) {
        t.style.setProperty('--tilt', '0deg');
        return;
      }
      // Inclinação máxima de 6 graus, proporcional à proximidade.
      const intensity = 1 - dist / 200;
      const angle = Math.max(-6, Math.min(6, (dx / 30) * intensity));
      t.style.setProperty('--tilt', `${angle}deg`);
    };
    return subscribeMousePosition(update);
  }, []);

  // Tira a animação de spawn depois que ela termina (600ms).
  useEffect(() => {
    const t = setTimeout(() => setSpawning(false), 700);
    return () => clearTimeout(t);
  }, []);

  // ----- Drag handlers -------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragRef.current = {
        pointerId: e.pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
      };
      movedRef.current = false;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      // Detecção de cliques rápidos (susto): se 4+ cliques em 600ms, scare.
      const now = Date.now();
      const cutoff = now - 600;
      recentClicksRef.current = recentClicksRef.current.filter((t) => t > cutoff);
      recentClicksRef.current.push(now);
      if (recentClicksRef.current.length >= 4 && onScare) {
        onScare(pet.id);
        recentClicksRef.current = [];
      }

      // Detecção de carinho (hold): após 300ms segurando sem mover, começa a gerar corações.
      holdStartRef.current = now;
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
      holdTimerRef.current = setInterval(() => {
        if (movedRef.current) {
          if (holdTimerRef.current) clearInterval(holdTimerRef.current);
          holdTimerRef.current = null;
          return;
        }
        if (Date.now() - holdStartRef.current < 300) return;
        // Spawn coração na posição do mouse com pequeno offset aleatório.
        if (onPet) {
          const r = wrapperRef.current?.getBoundingClientRect();
          if (r) {
            const cx = r.left + r.width / 2 + (Math.random() - 0.5) * 40;
            const cy = r.top + 20 + (Math.random() - 0.5) * 20;
            onPet(pet.id, cx, cy);
          }
        }
      }, 250);
    },
    [pet.id, onPet, onScare]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const x = e.clientX - drag.offsetX;
      const y = e.clientY - drag.offsetY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1) {
        movedRef.current = true;
      }
      onMove(pet.id, x, y);
    },
    [pet.id, onMove]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Sempre limpa o holdTimer ao soltar.
      if (holdTimerRef.current) {
        clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId) {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
        dragRef.current = null;
        setDragging(false);
        // Se houve carinho (hold > 300ms sem mover), não dispara click.
        const wasPetting = !movedRef.current && Date.now() - holdStartRef.current > 300;
        if (!movedRef.current && e.button === 0 && !wasPetting) {
          // Single-click sempre dispara imediatamente (abre terminal).
          // Se um segundo click vier dentro de 400ms, dispara também o pulinho.
          const now = Date.now();
          const isDouble = now - lastClickAtRef.current < 400;
          lastClickAtRef.current = isDouble ? 0 : now;

          onClick(pet.id);

          if (isDouble) {
            const w = wrapperRef.current;
            if (w) {
              w.classList.remove('pet-bounce');
              void w.offsetWidth;
              w.classList.add('pet-bounce');
              setTimeout(() => w.classList.remove('pet-bounce'), 700);
            }
            onDoubleClick?.(pet.id);
          }
        }
      }
    },
    [pet.id, onClick, onDoubleClick]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(pet.id, e.clientX, e.clientY);
    },
    [pet.id, onContextMenu]
  );

  useEffect(() => {
    return () => {
      dragRef.current = null;
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`pet-wrapper interactive state-${pet.state}${dragging ? ' dragging' : ''}${spawning ? ' pet-spawning' : ''}`}
      style={{
        left: pet.position.x,
        top: pet.position.y,
        filter: 'drop-shadow(0 6px 6px rgba(0, 0, 0, 0.35))',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
      title={`MESP ${pet.id} (${pet.state})`}
      aria-label={`Pet MESP ${pet.id}, estado: ${pet.state}`}
      role="button"
    >
      {pet.showBubble && pet.task && (
        <SpeechBubble task={pet.task} onClick={() => onBubbleClick(pet.id)} />
      )}

      <div ref={tiltRef} className="pet-tilt">
        <img
          src={frame}
          alt={`MESP ${pet.state}`}
          className={`pet-sprite pixelated${flipX ? ' flip-x' : ''}`}
          draggable={false}
        />
        {eye && (
          <div
            ref={pupilRef}
            className="pet-pupil"
            style={{
              width: eye.size,
              height: eye.size,
            }}
            aria-hidden
          />
        )}
      </div>
      <div className="pet-shadow" aria-hidden />
      {pet.state === 'sleeping' && (
        <div className="pet-zzz" aria-hidden>
          <span className="zzz zzz-1">Z</span>
          <span className="zzz zzz-2">Z</span>
          <span className="zzz zzz-3">Z</span>
        </div>
      )}
    </div>
  );
}

export const Pet = memo(PetComponent);
