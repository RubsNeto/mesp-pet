import { useEffect, useRef } from 'react';
import { BotEngine } from '../coucou/engine';
import type { BotEmoteName, BotStateName } from '../coucou/layout';
import { getSpritesForTraits } from '../assets/sprites';
import type { MespTraits } from '../procedural/traits';
import { classicDockTraits } from '../procedural/dockTraits.mjs';
import type { PetState } from '../types';

const STATES: Record<PetState, BotStateName> = {
  idle: 'idle',
  walking: 'searching',
  thinking: 'thinking',
  working: 'working',
  waiting: 'approval',
  success: 'finished',
  error: 'error',
  sleeping: 'sleeping',
  sitting: 'idle',
};

export function DockMascot({
  traits,
  state,
  emote,
  reaction,
  mini = false,
  petting = false,
}: {
  traits: MespTraits;
  state: PetState;
  emote: BotEmoteName | 'slap' | 'greet' | 'squash';
  reaction: number;
  mini?: boolean;
  petting?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<BotEngine | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const pettingRef = useRef(petting);
  pettingRef.current = petting;
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const bot = new BotEngine();
    bot.isMini = mini;
    engine.current = bot;
    const cleanTraits = classicDockTraits(traits);
    const sets = {
      normal: getSpritesForTraits(cleanTraits),
    };
    const images = new Map<string, HTMLImageElement>();
    Object.values(sets).forEach((set) =>
      Object.values(set.frames)
        .flat()
        .forEach((url) => {
          if (images.has(url)) return;
          const img = new Image();
          img.src = url;
          images.set(url, img);
        }),
    );
    bot.customBody = (x, radius) => {
      const shape = bot.eyeOverride;
      // Expressions keep the MESP's own white eye instead of replacing it with coloured symbols.
      const set = sets.normal;
      const closed =
        pettingRef.current ||
        (shape && ['heart', 'happy', 'closed', 'line', 'wink'].includes(shape));
      el.dataset.eye = closed || bot.open < 0.25 || bot.state === 'sleeping' ? 'closed' : 'open';
      const frame =
        closed || bot.open < 0.25
          ? set.frames.idle[7]
          : bot.state === 'sleeping'
            ? set.frames.sleeping[0]
            : bot.state === 'dizzy' || bot.state === 'error'
              ? set.frames.error[0]
              : set.frames.idle[0];
      const image = images.get(frame);
      if (!image?.complete || !image.naturalWidth) return;
      const d = radius * 2.9;
      x.imageSmoothingEnabled = false;
      x.rotate(bot.roll);
      if (pettingRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const breath = Math.sin(performance.now() / 170) * 0.018;
        x.scale(1 + breath, 1 - breath);
      }
      x.drawImage(image, -d / 2, -d / 2, d, d);
      const eye = set.eye[frame];
      if (eye) {
        for (const slot of eye.slots) {
          const scale = d / 96;
          const px = -d / 2 + (slot.cx + Math.sin(bot.yaw) * slot.rx) * scale;
          const py = -d / 2 + (slot.cy - Math.sin(bot.pitch) * slot.ry) * scale;
          x.fillStyle = '#10131a';
          x.beginPath();
          x.arc(px, py, (eye.size * scale) / 2, 0, Math.PI * 2);
          x.fill();
          x.fillStyle = '#fff';
          x.fillRect(px - 1, py - 1, 1.4, 1.4);
        }
      }
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(116 * dpr);
      el.height = Math.round(104 * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const onMouse = (e: MouseEvent) => {
      if (mini) return;
      const r = el.getBoundingClientRect();
      bot.lookX = Math.max(-1, Math.min(1, (e.clientX - r.x - r.width / 2) / 170));
      bot.lookY = Math.max(-1, Math.min(1, (e.clientY - r.y - r.height / 2) / 170));
    };
    document.addEventListener('mousemove', onMouse, { passive: true });
    window.addEventListener('resize', resize);
    let raf = 0,
      previous = performance.now(),
      lastPaint = 0;
    let lastExternalState: PetState | null = null;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastPaint < (reduced.matches ? 100 : 1000 / 40)) return;
      if (lastExternalState !== stateRef.current) {
        lastExternalState = stateRef.current;
        bot.setState(STATES[stateRef.current]);
      }
      bot.update(Math.min(0.04, (now - previous) / 1000));
      previous = now;
      lastPaint = now;
      if (reduced.matches) {
        bot.sx = 1;
        bot.sy = 1;
        bot.roll = 0;
        bot.ox = 0;
        bot.oy = 0;
        bot.tilt = 0;
      }
      ctx.clearRect(0, 0, 116, 104);
      bot.draw(ctx, 116, 104);
      el.dataset.squashed = bot.sy < 0.94 && bot.sx > 1.04 ? 'true' : 'false';
    };
    raf = requestAnimationFrame(tick);
    if (!reduced.matches && !mini) bot.greet();
    return () => {
      cancelAnimationFrame(raf);
      bot.dispose();
      document.removeEventListener('mousemove', onMouse);
      window.removeEventListener('resize', resize);
      engine.current = null;
    };
  }, [traits, mini]);
  useEffect(() => {
    if (!reaction || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (emote === 'slap') engine.current?.slap();
    else if (emote === 'greet') engine.current?.greet();
    else if (emote === 'squash') {
      engine.current?.squash();
      engine.current?.blink();
    } else engine.current?.triggerEmote(emote);
  }, [emote, reaction]);
  return (
    <canvas ref={canvas} className="dock-mascot" width="116" height="104" aria-hidden="true" />
  );
}
