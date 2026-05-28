'use client';

import { motion } from 'motion/react';
import { MespCanvas } from './MespCanvas';
import type { Accessory, FamilyName, MespOpts, SpotPattern } from '@/lib/mesp-renderer';

interface ShowcaseItem {
  label: string;
  family: FamilyName;
  accessory: Accessory;
  spots: SpotPattern;
  opts: Partial<MespOpts>;
}

const SHOWCASE: ShowcaseItem[] = [
  { label: 'idle', family: 'sky', accessory: 'none', spots: 'none', opts: { eye: 'open' } },
  { label: 'sparkle', family: 'rose', accessory: 'bow', spots: 'none', opts: { eye: 'sparkle' } },
  { label: 'walking', family: 'mint', accessory: 'ears', spots: 'none', opts: { eye: 'open' } },
  { label: 'jumping', family: 'lemon', accessory: 'horns', spots: 'none', opts: { eye: 'sparkle', feet: 'jump', bodyDy: -1 } },
  { label: 'angel', family: 'lilac', accessory: 'halo', spots: 'none', opts: { eye: 'open' } },
  { label: 'flower', family: 'peach', accessory: 'flower', spots: 'belly', opts: { eye: 'open' } },
  { label: 'antenna', family: 'aqua', accessory: 'antenna', spots: 'patches', opts: { eye: 'open' } },
  { label: 'star', family: 'coral', accessory: 'star', spots: 'heart', opts: { eye: 'sparkle' } },
  { label: 'sleeping', family: 'lavender', accessory: 'none', spots: 'none', opts: { eye: 'closed', feet: 'sit' } },
  { label: 'sitting', family: 'cream', accessory: 'flower', spots: 'none', opts: { eye: 'open', feet: 'sit' } },
  { label: 'confused', family: 'sage', accessory: 'none', spots: 'patches', opts: { eye: 'confused' } },
  { label: 'ghost', family: 'ghost', accessory: 'antenna', spots: 'none', opts: { eye: 'open' } },
];

export function SpriteShowcase() {
  return (
    <section
      id="states"
      className="relative overflow-hidden border-y border-white/[0.06] py-24"
    >
      <motion.header
        initial={{ y: 30, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="mx-auto mb-16 max-w-2xl px-6 text-center"
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/35">
          12 famílias · 7 acessórios · 4 padrões
        </span>
        <h2 className="mt-3 font-display text-[clamp(32px,5vw,52px)] font-semibold leading-[1.05] tracking-[-0.03em]">
          Cada MESP é{' '}
          <span className="grad-text-vivid">único</span>.
        </h2>
        <p className="mt-5 text-[16px] leading-relaxed text-white/55 sm:text-[17px]">
          Tudo gerado proceduralmente em código. Cada novo pet sorteia uma
          combinação diferente. Spawn quantos quiser.
        </p>
      </motion.header>

      {/* Marquee row */}
      <div className="marquee-mask relative w-full">
        <div
          className="flex w-max items-center gap-6 px-4"
          style={{ animation: 'marquee 50s linear infinite' }}
        >
          {[...SHOWCASE, ...SHOWCASE].map((item, i) => (
            <ShowcaseCard key={`a-${i}`} item={item} />
          ))}
        </div>
      </div>

      {/* Reverse row */}
      <div className="marquee-mask relative mt-6 w-full">
        <div
          className="flex w-max items-center gap-6 px-4"
          style={{ animation: 'marquee 60s linear infinite reverse' }}
        >
          {[...SHOWCASE.slice(2), ...SHOWCASE, ...SHOWCASE.slice(0, 4)].map((item, i) => (
            <ShowcaseCard key={`b-${i}`} item={item} small />
          ))}
        </div>
      </div>
    </section>
  );
}

function ShowcaseCard({ item, small = false }: { item: ShowcaseItem; small?: boolean }) {
  const size = small ? 88 : 120;
  return (
    <div
      className={`group relative flex shrink-0 flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur transition hover:border-white/15 hover:bg-white/[0.04] ${
        small ? 'h-28 w-28' : 'h-36 w-36'
      }`}
    >
      <MespCanvas
        size={size}
        opts={{
          family: item.family,
          accessory: item.accessory,
          spots: item.spots,
          spotColor: '#ffffff',
          ...item.opts,
        }}
        animate
        walking={item.label === 'walking'}
        hoverSparkle
        className={small ? 'size-16' : 'size-24'}
      />
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/60 opacity-0 transition group-hover:opacity-100">
        {item.label}
      </div>
    </div>
  );
}
