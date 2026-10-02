import { useEffect } from 'react';

// Native cursor polling also catches the wake strip while the window is click-through.
export function useDockHitTest(): void {
  useEffect(() => {
    if (!window.mesp?.setDockHitRegions) return;
    let previous = '';
    let frame = 0;
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
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    const resize = new ResizeObserver(schedule);
    const observeRegions = () =>
      document.querySelectorAll('.interactive').forEach((el) => resize.observe(el));
    observeRegions();
    const mutations = new MutationObserver((changes) => {
      if (changes.some((change) => change.type === 'childList')) observeRegions();
      schedule();
    });
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
    window.addEventListener('resize', schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
      void window.mesp?.setDockHitRegions([]);
    };
  }, []);
}
