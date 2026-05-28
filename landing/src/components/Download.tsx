'use client';

import { motion } from 'motion/react';
import { MespCanvas } from './MespCanvas';

export function Download() {
  return (
    <section id="download" className="relative px-6 py-32">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ y: 50, opacity: 0, scale: 0.97 }}
          whileInView={{ y: 0, opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.015] to-transparent p-10 sm:p-16"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `
                radial-gradient(circle at 15% 10%, rgba(111,207,238,0.18), transparent 50%),
                radial-gradient(circle at 85% 20%, rgba(244,138,178,0.18), transparent 50%),
                radial-gradient(circle at 50% 100%, rgba(180,138,239,0.15), transparent 50%)
              `,
              filter: 'blur(20px)',
            }}
          />
          <div className="grid-bg radial-fade absolute inset-0 opacity-30" />

          <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <motion.span
                initial={{ y: 16, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="inline-block font-mono text-[11px] uppercase tracking-[0.22em] text-white/35"
              >
                Download
              </motion.span>
              <motion.h2
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="mt-3 font-display text-[clamp(36px,6vw,64px)] font-semibold leading-[1.0] tracking-[-0.04em]"
              >
                Pegue o MESP.
                <br />
                <span className="text-white/35">É de graça.</span>
              </motion.h2>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="mt-5 max-w-md text-[16px] leading-relaxed text-white/55 sm:text-[17px]"
              >
                Windows, macOS e Linux. Open source, MIT.
                Sem cadastro, sem tracking, sem nada.
              </motion.p>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.4 }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <DownloadBtn label="Windows" sub=".exe" primary />
                <DownloadBtn label="macOS" sub=".dmg" />
                <DownloadBtn label="Linux" sub=".AppImage" />
              </motion.div>

              <motion.p
                initial={{ y: 16, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.5 }}
                className="mt-5 text-[12.5px] text-white/35"
              >
                Não assinado: o Windows pode pedir &ldquo;executar mesmo
                assim&rdquo; no SmartScreen.
              </motion.p>
            </div>

            <motion.div
              initial={{ scale: 0.7, opacity: 0, y: 20 }}
              whileInView={{ scale: 1, opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.9, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex justify-center"
            >
              <div className="relative">
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10 scale-125 rounded-full bg-gradient-to-br from-rose-400/30 via-amber-300/20 to-violet-400/25 blur-3xl"
                />
                <div className="mesp-float">
                  <MespCanvas
                    size={300}
                    opts={{
                      family: 'coral',
                      accessory: 'star',
                      spots: 'heart',
                      eye: 'sparkle',
                      spotColor: '#ffffff',
                    }}
                    animate
                    className="size-52 sm:size-64"
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function DownloadBtn({
  label,
  sub,
  primary,
}: {
  label: string;
  sub: string;
  primary?: boolean;
}) {
  if (primary) {
    return (
      <a
        href="https://github.com/RubsNeto/mesp-pet/releases"
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex h-12 items-center gap-2.5 rounded-full bg-white px-5 text-black shadow-[0_15px_40px_-10px_rgba(255,255,255,0.3)] transition hover:scale-[1.02]"
      >
        <svg viewBox="0 0 24 24" className="size-4">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
          />
        </svg>
        <span className="text-left">
          <span className="block font-display text-[14px] font-semibold leading-tight">
            {label}
          </span>
          <span className="block font-mono text-[10px] text-black/55">{sub}</span>
        </span>
      </a>
    );
  }
  return (
    <a
      href="https://github.com/RubsNeto/mesp-pet/releases"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-12 items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.04] px-5 text-white backdrop-blur transition hover:border-white/30 hover:bg-white/[0.08]"
    >
      <span className="text-left">
        <span className="block font-display text-[14px] font-semibold leading-tight">
          {label}
        </span>
        <span className="block font-mono text-[10px] text-white/40">{sub}</span>
      </span>
    </a>
  );
}
