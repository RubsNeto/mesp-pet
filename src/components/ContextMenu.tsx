// src/components/ContextMenu.tsx
//
// Menu de contexto simples renderizado em posição absoluta.
// Fecha ao clicar fora ou apertar Esc.

import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: string;
  disabled?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: Array<ContextMenuItem | 'separator'>;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!ref.current) return;
      if (e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Ajusta posição se vai sair da tela.
  const pos = clampToViewport(x, y);

  return (
    <div
      ref={ref}
      className="context-menu interactive"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      aria-label="Menu de contexto do MESP"
    >
      {items.map((item, idx) =>
        item === 'separator' ? (
          <div key={`sep-${idx}`} className="context-menu-separator" />
        ) : (
          <div
            key={item.label}
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            role="menuitem"
            aria-disabled={item.disabled}
            style={item.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
          >
            {item.icon && <span aria-hidden>{item.icon}</span>}
            <span>{item.label}</span>
          </div>
        )
      )}
    </div>
  );
}

function clampToViewport(x: number, y: number): { x: number; y: number } {
  const w = 200;
  const h = 280;
  const maxX = (typeof window !== 'undefined' ? window.innerWidth : 1024) - w - 8;
  const maxY = (typeof window !== 'undefined' ? window.innerHeight : 768) - h - 8;
  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY)),
  };
}
