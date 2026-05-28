'use client';

import { useEffect, useRef } from 'react';
import { renderMesp, type MespOpts } from '@/lib/mesp-renderer';

interface MespCanvasProps {
  size: number;
  opts: MespOpts;
  /** when true, animates blink + subtle breathing */
  animate?: boolean;
  /** when true, animates walking phase */
  walking?: boolean;
  className?: string;
  /** override eye on hover (useful for galleries) */
  hoverSparkle?: boolean;
}

/**
 * Canvas that renders a procedurally-generated MESP pet.
 * Animates idle blinks and optional walk/breath cycles.
 */
export function MespCanvas({
  size,
  opts,
  animate = false,
  walking = false,
  className = '',
  hoverSparkle = false,
}: MespCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const optsRef = useRef(opts);
  const hoverRef = useRef(false);

  // keep latest opts
  optsRef.current = opts;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let lastDraw = 0;
    const tick = (now: number) => {
      const interval = reduce ? 4000 : 120;
      if (now - lastDraw >= interval) {
        lastDraw = now;
        const o = { ...optsRef.current };
        if (animate || walking) {
          // blink window
          const blinkPeriod = 3500;
          const phase = (now % blinkPeriod) / blinkPeriod;
          if (!hoverRef.current && phase > 0.94 && phase < 0.99) {
            o.eye = 'blink';
          } else if (hoverRef.current && hoverSparkle) {
            o.eye = 'sparkle';
          }
          // breath
          const breath = Math.sin(now / 700);
          o.bodyDy = breath > 0.7 ? -1 : 0;
          if (walking) {
            o.walkPhase = (now % 800) / 800;
          }
        } else if (hoverRef.current && hoverSparkle) {
          o.eye = 'sparkle';
        }
        renderMesp(canvas, o);
      }
      raf = requestAnimationFrame(tick);
    };

    if (animate || walking) {
      raf = requestAnimationFrame(tick);
    } else {
      // single draw
      renderMesp(canvas, optsRef.current);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [animate, walking, hoverSparkle]);

  // re-render once when opts change (and not animating)
  useEffect(() => {
    if (animate || walking) return;
    const canvas = ref.current;
    if (!canvas) return;
    renderMesp(canvas, opts);
  }, [opts, animate, walking]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      data-pixelated
      className={className}
      onMouseEnter={() => {
        hoverRef.current = true;
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
      }}
      aria-hidden="true"
    />
  );
}
