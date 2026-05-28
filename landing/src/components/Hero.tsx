'use client';

import { motion, type Variants } from 'motion/react';
import { HeroMesp } from './HeroMesp';

const fadeUp: Variants = {
  hidden: { y: 24, opacity: 0 },
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    transition: { duration: 0.8, delay: 0.15 + i * 0.06, ease: 'easeOut' },
  }),
};

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 pt-32 pb-20 sm:pt-40"
    >
      {/* layered background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-bg radial-fade absolute inset-0 opacity-50" />

        <div
          className="absolute left-1/2 top-1/2 size-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40"
          style={{
            background:
              'radial-gradient(circle, rgba(111,207,238,0.18) 0%, rgba(180,138,239,0.10) 30%, transparent 60%)',
            filter: 'blur(40px)',
          }}
        />
        <div
          className="absolute -left-32 top-32 size-96 rounded-full opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(244,138,178,0.20) 0%, transparent 70%)',
            animation: 'blob-drift 24s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -right-32 top-64 size-96 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(122,223,153,0.15) 0%, transparent 70%)',
            animation: 'blob-drift 28s ease-in-out infinite reverse',
          }}
        />
      </div>

      {/* Pill */}
      <motion.a
        href="https://github.com/RubsNeto/mesp-pet/releases"
        target="_blank"
        rel="noopener noreferrer"
        custom={0}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="group glass mb-10 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium text-white/70 transition hover:border-white/20 hover:text-white"
      >
        <span className="relative flex size-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative size-1.5 rounded-full bg-emerald-400" />
        </span>
        <span>v1.0 disponível</span>
        <span className="text-white/30">·</span>
        <span>baixar agora</span>
        <svg viewBox="0 0 24 24" className="size-3 transition group-hover:translate-x-0.5">
          <path
            d="M9 18l6-6-6-6"
            strokeWidth="2"
            stroke="currentColor"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </motion.a>

      {/* MESP hero — procedural canvas with cursor-tracking pupil */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-full opacity-80 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(111,207,238,0.4) 0%, rgba(180,138,239,0.2) 50%, transparent 75%)',
          }}
        />
        <div className="mesp-float">
          <HeroMesp
            size={256}
            opts={{
              family: 'sky',
              accessory: 'none',
              spots: 'none',
              eye: 'open',
            }}
            animate
            className="size-44 sm:size-56 lg:size-64"
          />
        </div>
        <div
          aria-hidden
          className="absolute -bottom-2 left-1/2 h-3 w-2/3 -translate-x-1/2 rounded-full bg-black/70 blur-md"
        />
      </motion.div>

      {/* Title */}
      <motion.h1
        custom={1}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="font-display text-center text-[clamp(44px,9vw,96px)] leading-[0.95] font-semibold tracking-[-0.04em]"
      >
        Pixel-art companion <br className="hidden sm:block" />
        for AI <span className="grad-text-vivid">coders</span>.
      </motion.h1>

      <motion.p
        custom={2}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="mt-7 max-w-[620px] text-center text-[17px] leading-[1.6] text-white/55 sm:text-[19px]"
      >
        Um companion fofo no canto da sua tela que acompanha sua sessão da
        Kiro CLI, Claude Code e Aider. Reage quando você acerta. Se preocupa
        quando você quebra a build.
      </motion.p>

      {/* CTAs */}
      <motion.div
        custom={3}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="mt-10 flex flex-wrap items-center justify-center gap-3"
      >
        <a
          href="#download"
          className="group relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-full bg-white px-6 text-[14px] font-semibold text-black shadow-[0_8px_30px_rgba(255,255,255,0.12)] transition hover:scale-[1.02] active:scale-[0.99]"
        >
          <span className="relative z-10">Baixar grátis</span>
          <svg viewBox="0 0 24 24" className="relative z-10 size-3.5">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
            />
          </svg>
        </a>

        <a
          href="https://github.com/RubsNeto/mesp-pet"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-6 text-[14px] font-medium text-white backdrop-blur transition hover:border-white/25 hover:bg-white/[0.06]"
        >
          <svg viewBox="0 0 24 24" className="size-4">
            <path
              fill="currentColor"
              d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.07c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.16 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.07 0 4.4-2.7 5.36-5.27 5.65.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.79.55 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z"
            />
          </svg>
          Star no GitHub
        </a>
      </motion.div>

      {/* Brands strip */}
      <motion.div
        custom={4}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="mt-20 flex w-full max-w-3xl flex-col items-center gap-5"
      >
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-white/30">
          Suporta as principais CLIs de IA
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-white/40">
          {['Kiro CLI', 'Claude Code', 'Aider', 'Codex', 'Gemini', 'Cursor', 'Copilot'].map((b) => (
            <span
              key={b}
              className="font-display text-[15px] font-medium tracking-tight transition hover:text-white"
            >
              {b}
            </span>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
