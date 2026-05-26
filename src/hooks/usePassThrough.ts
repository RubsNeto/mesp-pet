import { useEffect } from 'react';

export function usePassThrough(): void {
  useEffect(() => {
    if (!window.mesp) return;
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
}
