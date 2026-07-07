// src/components/Pet.tsx
//
// Renderiza um único pet:
//   - sprite atual (animação cíclica)
//   - sombra
//   - balão de fala (SpeechBubble)
//   - pupilas que seguem o cursor (atualizadas via ref imperativamente)
//   - tratamento de drag, click e contextmenu
//
// Performance: as pupilas são atualizadas via ref direto no DOM (sem React
// state), e o componente é memoizado para evitar re-renders quando outros
// pets mudam.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SPRITE_FLIPS_ON_RIGHT, SPRITE_EYE, getSpritesForTraits } from '../assets/sprites';
import type { EyeConfig } from '../assets/sprites';
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
  /** Mostrar o HUD (status/tempo) sobre o pet. */
  showHud?: boolean;
}

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

// Layout: wrapper 128x128 contém tilt 96x96 centralizado horizontalmente
// e alinhado pelo bottom (devido ao flex column justify-end items-center).
const TILT_W = 96;
const TILT_X_OFFSET = 16;
const TILT_Y_OFFSET = 32;

// Rótulos curtos do HUD por estado ocupado.
const HUD_LABEL: Partial<Record<string, string>> = {
  thinking: 'pensando',
  working: 'trabalhando',
  waiting: 'precisa de você',
};

// Partículas por aura (4 cada, distribuídas por posições p0..p3 no CSS).
const AURA_EMOJI: Record<string, string[]> = {
  sparkles: ['✨', '✨', '⭐', '✨'],
  hearts: ['💖', '💕', '❤️', '💗'],
  flames: ['🔥', '🔥', '🔥', '✨'],
  snow: ['❄️', '❄️', '✦', '❄️'],
  leaves: ['🍃', '🍂', '🍃', '🌿'],
};

/** Formata segundos como "12s" ou "1m04s". */
function formatElapsed(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

function PetComponent({ pet, onMove, onClick, onDoubleClick, onBubbleClick, onContextMenu, onPet, onScare, showHud = true }: PetProps) {
  const { frame } = usePetAnimation(pet.state, pet.traits);
  const spriteSet = pet.traits ? getSpritesForTraits(pet.traits) : null;
  const flipsMap = spriteSet?.flips ?? SPRITE_FLIPS_ON_RIGHT;
  const eyeMap = spriteSet?.eye ?? SPRITE_EYE;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  // Suporta múltiplas pupilas — uma ref por slot.
  const pupilRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [dragging, setDragging] = useState(false);
  const [spawning, setSpawning] = useState(true);
  // HUD: tempo decorrido enquanto o agente está ocupado (thinking/working/waiting).
  const [elapsed, setElapsed] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const movedRef = useRef(false);
  const lastClickAtRef = useRef(0);

  // Detecção de carinho (hold).
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef(0);

  // Detecção de cliques rápidos (susto).
  const recentClicksRef = useRef<number[]>([]);

  const flipX = (flipsMap[frame] ?? false) && pet.facing === 'right';
  const eyeConfig: EyeConfig | null = eyeMap[frame] ?? null;

  // Lista de slots — número garantido estável por frame (até trocar de frame).
  const slots = useMemo(() => eyeConfig?.slots ?? [], [eyeConfig]);

  // Refs sempre atualizados — usados pelo subscribe do mouse.
  const eyeRef = useRef<EyeConfig | null>(eyeConfig);
  const posRef = useRef(pet.position);
  const flipRef = useRef(flipX);
  useLayoutEffect(() => {
    eyeRef.current = eyeConfig;
    posRef.current = pet.position;
    flipRef.current = flipX;
  }, [eyeConfig, pet.position, flipX]);

  // Subscribe ao mouse e atualiza as pupilas imperativamente.
  // ZERO re-renders do React causados por movimento do mouse.
  useEffect(() => {
    if (!eyeConfig || eyeConfig.slots.length === 0) return;

    const update = (mx: number, my: number) => {
      const cfg = eyeRef.current;
      if (!cfg) return;
      const flipped = flipRef.current;
      const px = posRef.current.x;
      const py = posRef.current.y;

      for (let i = 0; i < cfg.slots.length; i += 1) {
        const slot = cfg.slots[i]!;
        const pupil = pupilRefs.current[i];
        if (!pupil) continue;

        // Quando o sprite está flipado (andando para a direita), o olho
        // aparece em (TILT_W - cx) dentro do tilt.
        const visualCx = flipped ? TILT_W - slot.cx : slot.cx;

        const eyeWorldX = px + TILT_X_OFFSET + visualCx;
        const eyeWorldY = py + TILT_Y_OFFSET + slot.cy;
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
        let offX = dx * slot.rx;
        let offY = dy * slot.ry;
        if (slot.rx > 0 && slot.ry > 0) {
          const t = Math.hypot(offX / slot.rx, offY / slot.ry);
          if (t > 1) {
            offX /= t;
            offY /= t;
          }
        }
        const left = visualCx + offX - cfg.size / 2;
        const top = slot.cy + offY - cfg.size / 2;
        pupil.style.left = `${left}px`;
        pupil.style.top = `${top}px`;
      }
    };
    return subscribeMousePosition(update);
  }, [eyeConfig]);

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

  // Tira a animação de spawn depois que ela termina (700ms).
  useEffect(() => {
    const t = setTimeout(() => setSpawning(false), 700);
    return () => clearTimeout(t);
  }, []);

  // HUD: cronômetro do tempo que o agente está ocupado. Zera ao entrar num
  // estado ocupado e conta de segundo em segundo; para quando volta a idle.
  const isBusy = pet.state === 'thinking' || pet.state === 'working' || pet.state === 'waiting';
  useEffect(() => {
    if (!isBusy) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isBusy, pet.state]);

  // Comemoração: o pet fica "grandão" e dá uma volta rápida por toda a tela,
  // passando pelos quatro cantos e voltando pra casa. Feito imperativamente com
  // a Web Animations API no wrapper, pra cobrir a tela inteira independente de
  // onde o pet está (uma keyframe CSS fixa não daria a volta a partir de
  // qualquer posição). Roda a cada vez que o estado vira "success".
  const lapAnimRef = useRef<Animation | null>(null);
  useEffect(() => {
    if (pet.state !== 'success') return;
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof wrapper.animate !== 'function') return;

    // Cancela uma volta anterior que ainda esteja rodando.
    lapAnimRef.current?.cancel();

    const W = window.innerWidth;
    const H = window.innerHeight;
    const scale = 1.8; // "grandão"
    const r = 64 * scale; // raio aprox. do wrapper escalado, p/ manter na tela
    const cx0 = posRef.current.x + 64; // centro atual do pet
    const cy0 = posRef.current.y + 64;

    // Centros-alvo nos quatro cantos, com folga pro tamanho aumentado.
    const corners = [
      { x: r, y: r },
      { x: W - r, y: r },
      { x: W - r, y: H - r },
      { x: r, y: H - r },
    ];

    // Começa pelo canto mais próximo, pra volta fluir natural.
    let startIdx = 0;
    let best = Infinity;
    for (let i = 0; i < corners.length; i += 1) {
      const d = Math.hypot(corners[i]!.x - cx0, corners[i]!.y - cy0);
      if (d < best) {
        best = d;
        startIdx = i;
      }
    }
    const ordered = [0, 1, 2, 3].map((k) => corners[(startIdx + k) % 4]!);
    const at = (c: { x: number; y: number }) =>
      `translate(${Math.round(c.x - cx0)}px, ${Math.round(c.y - cy0)}px) scale(${scale})`;

    // Sobe na pilha durante a volta pra passar por cima de painéis/pets.
    wrapper.style.zIndex = '1000';

    const anim = wrapper.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', offset: 0 },
        // Pop "grandão" no lugar antes de sair correndo.
        { transform: 'translate(0px, 0px) scale(1.8)', offset: 0.1, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
        { transform: at(ordered[0]!), offset: 0.3 },
        { transform: at(ordered[1]!), offset: 0.48 },
        { transform: at(ordered[2]!), offset: 0.66 },
        { transform: at(ordered[3]!), offset: 0.84 },
        { transform: 'translate(0px, 0px) scale(1)', offset: 1 },
      ],
      { duration: 1600, easing: 'cubic-bezier(0.45, 0.05, 0.35, 1)' },
    );
    lapAnimRef.current = anim;

    const resetZ = () => {
      if (wrapperRef.current) wrapperRef.current.style.zIndex = '';
    };
    anim.onfinish = resetZ;
    anim.oncancel = resetZ;

    return () => {
      anim.cancel();
    };
  }, [pet.state]);

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

  // Limpa refs extras quando muda o número de slots.
  useEffect(() => {
    pupilRefs.current = pupilRefs.current.slice(0, slots.length);
  }, [slots.length]);

  return (
    <div
      ref={wrapperRef}
      className={`pet-wrapper interactive state-${pet.state}${dragging ? ' dragging' : ''}${spawning ? ' pet-spawning' : ''}${pet.traits?.animStyle && pet.traits.animStyle !== 'breathe' ? ` anim-${pet.traits.animStyle}` : ''}`}
      style={{
        left: pet.position.x,
        top: pet.position.y,
        filter: 'drop-shadow(0 6px 6px rgba(0, 0, 0, 0.35))',
        ...(pet.traits?.scale && pet.traits.scale !== 1
          ? { transform: `scale(${pet.traits.scale})`, transformOrigin: '50% 88%' }
          : null),
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

      {/* HUD ambiente: status + tempo decorrido, legível de relance. */}
      {isBusy && showHud && (
        <div className={`pet-hud hud-${pet.state}`} aria-hidden>
          <span className="pet-hud-label">{HUD_LABEL[pet.state] ?? ''}</span>
          {elapsed > 0 && <span className="pet-hud-time">{formatElapsed(elapsed)}</span>}
        </div>
      )}

      {/* "Preciso de você": badge forte quando o agente aguarda input. */}
      {pet.state === 'waiting' && (
        <div className="pet-attention" aria-label="Aguardando você" title="O agente está esperando sua resposta">!</div>
      )}

      <div ref={tiltRef} className="pet-tilt">
        <img
          src={frame}
          alt={`MESP ${pet.state}`}
          className={`pet-sprite pixelated${flipX ? ' flip-x' : ''}`}
          draggable={false}
        />
        {eyeConfig && slots.map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              pupilRefs.current[i] = el;
            }}
            className="pet-pupil"
            style={{
              width: eyeConfig.size,
              height: eyeConfig.size,
              ...(pet.traits?.palette?.pupil ? { background: pet.traits.palette.pupil } : null),
            }}
            aria-hidden
          />
        ))}
      </div>
      <div className="pet-shadow" aria-hidden />
      {pet.traits?.aura && pet.traits.aura !== 'none' && (
        <div className={`pet-aura aura-${pet.traits.aura}`} aria-hidden>
          {AURA_EMOJI[pet.traits.aura]?.map((c, i) => (
            <span key={i} className={`pet-aura-p p${i}`}>{c}</span>
          ))}
        </div>
      )}
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
