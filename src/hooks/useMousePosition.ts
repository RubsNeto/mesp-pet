// src/hooks/useMousePosition.ts
//
// Tracker global de posição do mouse. Não usa React state — expõe
// `subscribe(callback)` para que componentes possam atualizar o DOM
// imperativamente (via ref) sem causar re-renders.
//
// Isto é crítico para performance: a pupila do pet seguia o mouse via
// re-render, o que causava 60-100 re-renders/seg em todos os pets.

let _x = 0;
let _y = 0;
let _attached = false;
let _rafId = 0;
const _subs = new Set<(x: number, y: number) => void>();

function _attach() {
  if (_attached || typeof window === 'undefined') return;
  _attached = true;
  _x = window.innerWidth / 2;
  _y = window.innerHeight / 2;
  window.addEventListener(
    'mousemove',
    (e: MouseEvent) => {
      _x = e.clientX;
      _y = e.clientY;
      if (_rafId) return;
      _rafId = requestAnimationFrame(() => {
        _rafId = 0;
        for (const cb of _subs) cb(_x, _y);
      });
    },
    { passive: true }
  );
}

export interface MousePosition {
  x: number;
  y: number;
}

/**
 * Subscribe a um callback que recebe (x, y) sempre que o mouse mover.
 * Retorna função para cancelar a inscrição.
 * Não dispara re-render do React — use para atualizar refs/DOM diretamente.
 */
export function subscribeMousePosition(cb: (x: number, y: number) => void): () => void {
  _attach();
  _subs.add(cb);
  // Dispara uma vez com a posição atual.
  cb(_x, _y);
  return () => {
    _subs.delete(cb);
  };
}

/** Lê a posição atual do mouse (snapshot, não reativo). */
export function getMousePosition(): MousePosition {
  return { x: _x, y: _y };
}
