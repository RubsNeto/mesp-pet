'use client';

import { motion } from 'motion/react';
import { MespCanvas } from './MespCanvas';

export function Nav() {
  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed left-1/2 top-4 z-50 w-[min(96%,1100px)] -translate-x-1/2"
    >
      <nav className="glass flex h-12 items-center justify-between rounded-full pl-3 pr-2">
        <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight">
          <MespCanvas
            size={64}
            opts={{ family: 'sky', accessory: 'none', spots: 'none', eye: 'open' }}
            className="size-7"
          />
          <span className="text-[14.5px]">MESP</span>
        </a>

        <div className="hidden items-center gap-1 text-[13px] text-white/55 md:flex">
          <a href="#features" className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.06] hover:text-white">
            Features
          </a>
          <a href="#states" className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.06] hover:text-white">
            Variações
          </a>
          <a href="#terminal" className="rounded-full px-3 py-1.5 transition hover:bg-white/[0.06] hover:text-white">
            Demo
          </a>
        </div>

        <a
          href="#download"
          className="group inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12.5px] font-semibold text-black transition hover:bg-white/90"
        >
          Baixar
          <svg viewBox="0 0 24 24" className="size-3 transition group-hover:translate-y-0.5">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
            />
          </svg>
        </a>
      </nav>
    </motion.header>
  );
}
