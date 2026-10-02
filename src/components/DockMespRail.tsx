import { useLayoutEffect, useRef, useState } from 'react';
import { DockMascot } from './DockMascot';
import { dockProjectStatus, unreadDockResult } from '../services/dockCore.mjs';
import { getPresetById } from '../services/aiPresets';
import type { PetEntity } from '../types';
import type { FsmState } from '../coucou/fsm';
import type { BotEmoteName } from '../coucou/layout';

export function DockMespRail({
  projects,
  primaryId,
  selectedId,
  mode,
  labels,
  emote,
  reaction,
  onSelect,
  onAdd,
  addingDisabled,
}: {
  projects: PetEntity[];
  primaryId: string;
  selectedId: string;
  mode: FsmState;
  labels: Record<string, string>;
  emote: BotEmoteName | 'slap' | 'greet' | 'squash';
  reaction: number;
  onSelect: (id: string) => void;
  onAdd: () => void;
  addingDisabled: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [pettingId, setPettingId] = useState<string | null>(null);
  const gesture = useRef({ x: 0, dragged: false });
  const positions = useRef(new Map<string, DOMRect>());
  const previousPrimary = useRef(primaryId);
  const other = projects.filter((p) => p.id !== primaryId);
  const orderKey = [primaryId, ...other.map((p) => p.id)].join(',');
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.current?.querySelectorAll<HTMLButtonElement>('[data-mesp-id]').forEach((el) => {
      const id = el.dataset.mespId!;
      const rect = el.getBoundingClientRect();
      const old = positions.current.get(id);
      next.set(id, rect);
      if (old && previousPrimary.current !== primaryId && !reduced) {
        el.animate(
          [
            {
              transform: `translate(${old.x - rect.x}px, ${old.y - rect.y}px) scale(${old.width / rect.width})`,
              opacity: 0.75,
            },
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          ],
          { duration: 440, easing: 'cubic-bezier(.16,1,.3,1)' },
        );
      }
    });
    positions.current = next;
    previousPrimary.current = primaryId;
  }, [orderKey, primaryId, mode]);
  return (
    <div ref={rail} className="dock-mesp-rail" aria-label="Seus MESP em paralelo">
      {projects.map((p) => {
        const main = p.id === primaryId;
        const index = other.findIndex((m) => m.id === p.id);
        const title = p.taskTitle || p.projectName || 'Novo projeto';
        const label = `${title} · ${p.projectName} · ${getPresetById(p.agentPresetId || '')?.name} · ${dockProjectStatus(p).label || labels[p.state]}${unreadDockResult(p) ? ' · Resultado novo' : ''}`;
        return (
          <button
            key={p.id}
            data-mesp-id={p.id}
            data-main={main}
            className={main ? 'dock-character-button' : 'dock-mini-button'}
            style={
              main
                ? undefined
                : ({
                    '--mini-column': Math.floor(index / 2),
                    '--mini-row': index % 2,
                  } as React.CSSProperties)
            }
            title={`${label} · Passe o mouse para fazer carinho; clique para conversar`}
            aria-label={`Abrir MESP: ${label}`}
            aria-current={p.id === selectedId ? 'true' : undefined}
            tabIndex={mode === 'hidden' || (mode === 'coucou' && !main) ? -1 : 0}
            onPointerEnter={(e) => {
              gesture.current.x = e.clientX;
            }}
            onPointerMove={(e) => {
              if (Math.abs(e.clientX - gesture.current.x) < 3) return;
              setPettingId(p.id);
              if (e.buttons) gesture.current.dragged = true;
              gesture.current.x = e.clientX;
            }}
            onPointerDown={(e) => {
              gesture.current = { x: e.clientX, dragged: false };
            }}
            onPointerLeave={() => setPettingId(null)}
            onPointerCancel={() => setPettingId(null)}
            onClick={() => {
              if (gesture.current.dragged) {
                gesture.current.dragged = false;
                return;
              }
              setPettingId(null);
              onSelect(p.id);
            }}
            data-petting={pettingId === p.id}
          >
            <DockMascot
              traits={p.traits}
              state={p.state}
              emote={main ? emote : 'happy'}
              reaction={main ? reaction : 0}
              mini={!main}
              petting={pettingId === p.id}
              active={mode !== 'hidden' && (mode !== 'coucou' || main)}
            />
            {pettingId === p.id && (
              <svg className="dock-petting-hand" viewBox="0 0 40 40" aria-hidden="true">
                <path d="M11 20V9a2.1 2.1 0 0 1 4.2 0v7.7V5.6a2.1 2.1 0 0 1 4.2 0v11V7.6a2.1 2.1 0 0 1 4.2 0v10.2V11a2.1 2.1 0 0 1 4.2 0v14c0 6-3.6 10-9 10h-2c-3.6 0-5.6-1.8-7.5-4.2l-6.2-7.3a2.3 2.3 0 0 1 3.4-3.1L11 24z" />
              </svg>
            )}
            {!main && <span className={`dock-mini-indicator state-${p.state}`} />}
            {main && p.completedAt && (
              <span className="dock-finished-mark" title="Tarefa concluída">
                ✓
              </span>
            )}
          </button>
        );
      })}
      <button
        className="dock-add-mesp"
        aria-label="Adicionar MESP"
        title="Novo MESP · outro projeto em paralelo"
        disabled={addingDisabled}
        onClick={onAdd}
        tabIndex={mode === 'hidden' || mode === 'coucou' ? -1 : 0}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
