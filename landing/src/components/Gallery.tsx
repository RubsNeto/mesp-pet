'use client';

import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { MespCanvas } from './MespCanvas';
import {
  ACCESSORIES,
  FAMILIES,
  randomTraits,
  type Accessory,
  type FamilyName,
  type RandomTraits,
} from '@/lib/mesp-renderer';

const families = Object.keys(FAMILIES) as FamilyName[];

function makeGalleryItems(count = 18): RandomTraits[] {
  const items: RandomTraits[] = [];
  // garante pelo menos 1 de cada família
  for (const f of families) {
    items.push(randomTraits({ family: f }));
  }
  // resto random
  while (items.length < count) {
    items.push(randomTraits());
  }
  // garante variedade visual (pelo menos metade com acessório)
  const withoutAcc = items.filter((it) => it.accessory === 'none');
  for (let i = 0; i < withoutAcc.length / 2; i++) {
    const choices: Accessory[] = ACCESSORIES.filter((a) => a !== 'none');
    withoutAcc[i].accessory = choices[Math.floor(Math.random() * choices.length)];
  }
  // shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, count);
}

export function Gallery() {
  const [items, setItems] = useState<RandomTraits[]>([]);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    setItems(makeGalleryItems(18));
  }, [seed]);

  const reroll = useCallback(() => setSeed((s) => s + 1), []);

  return (
    <section id="gallery" className="relative px-6 py-32">
      <div className="mx-auto max-w-7xl">
        <motion.header
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          className="mx-auto mb-12 max-w-2xl text-center"
        >
          <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-white/40">
            Galeria
          </span>
          <h2 className="mt-3 font-display text-[clamp(32px,5vw,52px)] font-semibold leading-[1.1] tracking-[-0.03em]">
            Conheça os <span className="grad-text">MESPs</span>.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-white/60">
            Cada novo pet sorteia cor, acessório e padrão. Aqui é uma amostra ao
            vivo — passe o mouse, eles brilham.
          </p>
          <button
            onClick={reroll}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-[14px] font-medium text-white backdrop-blur transition hover:border-white/30 hover:bg-white/[0.08] active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="size-4">
              <path
                fill="currentColor"
                d="M17.65 6.35A7.95 7.95 0 0012 4a8 8 0 100 16 7.96 7.96 0 007.55-5.45.5.5 0 00-.47-.66h-1.1a.5.5 0 00-.45.31A6 6 0 1112 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
              />
            </svg>
            Sortear novos
          </button>
        </motion.header>

        <motion.div
          key={seed}
          className="mx-auto grid max-w-5xl grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-6"
        >
          {items.map((traits, i) => (
            <motion.div
              key={`${seed}-${i}`}
              initial={{ scale: 0.7, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{
                duration: 0.55,
                delay: i * 0.04,
                ease: [0.2, 0.8, 0.2, 1],
              }}
              className="group relative aspect-square cursor-pointer overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] transition hover:scale-[1.05] hover:border-white/25"
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
                style={{
                  background: `linear-gradient(135deg, ${FAMILIES[traits.family].mid}30 0%, ${FAMILIES[traits.family].lo}15 100%)`,
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center p-3">
                <MespCanvas
                  size={96}
                  opts={traits}
                  animate
                  hoverSparkle
                  className="size-3/4 transition group-hover:scale-110"
                />
              </div>
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider text-white/30 opacity-0 transition group-hover:opacity-100">
                {traits.family}
                {traits.accessory !== 'none' ? ` · ${traits.accessory}` : ''}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
