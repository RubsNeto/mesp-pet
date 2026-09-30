import { useEffect } from 'react';

// Native cursor polling also catches the wake strip while the window is click-through.
export function useDockHitTest(): void {
  useEffect(() => {
    if (!window.mesp?.setDockHitRegions) return;
    let previous = '';
    const update = () => {
      const regions = [...document.querySelectorAll<HTMLElement>('.interactive')].flatMap((el) => {
        if (!el.checkVisibility()) return [];
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return [];
        return [
          {
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
          },
        ];
      });
      const serialized = JSON.stringify(regions);
      if (serialized === previous) return;
      previous = serialized;
      void window.mesp!.setDockHitRegions(regions);
    };
    update();
    const timer = window.setInterval(update, 40);
    return () => {
      window.clearInterval(timer);
      void window.mesp?.setDockHitRegions([]);
    };
  }, []);
}
