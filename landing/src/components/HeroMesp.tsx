'use client';

import { useEffect, useRef, useState } from 'react';
import { MespCanvas } from './MespCanvas';
import { MESP_GRID, MESP_EYE, type MespOpts } from '@/lib/mesp-renderer';

interface HeroMespProps {
  /** display size in CSS pixels */
  size: number;
  opts: MespOpts;
  className?: string;
  /** when true, animates blink + breath (forwarded to MespCanvas) */
  animate?: boolean;
  /** how far the pupil can move from center, in canvas-pixel ratio of the eye radius (0..1) */
  pupilRange?: number;
  /** smoothing factor for pupil movement (lower = smoother, higher = snappier) */
  smoothing?: number;
}

/**
 * Hero MESP that tracks the cursor with its pupil.
 * Canvas renders the MESP without a pupil; the pupil is a DOM element overlaid
 * on top, animated with requestAnimationFrame to follow the global pointer.
 */
export function HeroMesp({
  size,
  opts,
  className = '',
  animate = true,
  pupilRange = 0.55,
  smoothing = 0.18,
}: HeroMespProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pupilRef = useRef<HTMLDivElement>(null);

  // Eye is closed when blinking — hide pupil during those frames.
  const [eyeVisible, setEyeVisible] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let curX = 0;
    let curY = 0;

    function onMove(e: PointerEvent) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }
    window.addEventListener('pointermove', onMove);

    // Compute pupil offset based on mouse position relative to eye center.
    function tick() {
      const wrap = wrapRef.current;
      const pupil = pupilRef.current;
      if (wrap && pupil) {
        const rect = wrap.getBoundingClientRect();
        // eye center in screen coordinates (logical 16/32, 15/32)
        const eyeCenterX = rect.left + (rect.width * MESP_EYE.cx) / MESP_GRID.W;
        const eyeCenterY = rect.top + (rect.height * MESP_EYE.cy) / MESP_GRID.H;

        // distance from eye center to mouse
        const dx = mouseX - eyeCenterX;
        const dy = mouseY - eyeCenterY;
        const dist = Math.max(1, Math.hypot(dx, dy));

        // max travel = eye radius in px * pupilRange
        const eyeRadiusPx = (rect.width * MESP_EYE.rx) / MESP_GRID.W;
        const maxOff = eyeRadiusPx * pupilRange;

        // clamp distance: if mouse is far, pupil hits the inner edge
        const norm = Math.min(1, dist / 200);
        const targetX = (dx / dist) * maxOff * norm;
        const targetY = (dy / dist) * maxOff * norm;

        curX += (targetX - curX) * (reduce ? 1 : smoothing);
        curY += (targetY - curY) * (reduce ? 1 : smoothing);

        pupil.style.transform = `translate3d(calc(-50% + ${curX}px), calc(-50% + ${curY}px), 0)`;
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pupilRange, smoothing]);

  // Detect blink/closed/confused frames coming from the canvas animation cycle —
  // we hide the pupil during those moments so it doesn't show on top of an
  // outline-only eye.
  useEffect(() => {
    if (!animate) return;
    // mirror the same blink schedule used by MespCanvas
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    let raf = 0;
    function tick(now: number) {
      const blinkPeriod = 3500;
      const phase = (now % blinkPeriod) / blinkPeriod;
      const isBlinking = phase > 0.94 && phase < 0.99;
      setEyeVisible(!isBlinking);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [animate]);

  // Pupil is 1 logical pixel of the 32x32 grid → fraction of width.
  const pupilSize = `calc(100% / ${MESP_GRID.W})`;
  const eyeLeft = `${(MESP_EYE.cx / MESP_GRID.W) * 100}%`;
  const eyeTop = `${(MESP_EYE.cy / MESP_GRID.H) * 100}%`;

  return (
    <div
      ref={wrapRef}
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      <MespCanvas
        size={size * 2}
        opts={{ ...opts, noPupil: true }}
        animate={animate}
        className="absolute inset-0 size-full"
      />

      <div
        ref={pupilRef}
        aria-hidden
        className="absolute rounded-[1px] bg-[#162033] transition-opacity"
        style={{
          left: eyeLeft,
          top: eyeTop,
          width: pupilSize,
          height: pupilSize,
          transform: 'translate(-50%, -50%)',
          opacity: eyeVisible ? 1 : 0,
          willChange: 'transform',
        }}
      />
    </div>
  );
}
