'use client';

import { motion } from 'motion/react';
import { MespCanvas } from './MespCanvas';

export function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.8 }}
      className="relative border-t border-white/[0.06] px-6 py-12"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <MespCanvas
            size={64}
            opts={{ family: 'mint', accessory: 'none', spots: 'none', eye: 'open' }}
            className="size-6"
          />
          <span className="font-display text-[14px] font-semibold">MESP Pet</span>
        </div>

        <p className="text-center text-[12.5px] text-white/45">
          Feito com pixels e carinho por{' '}
          <a
            href="https://github.com/RubsNeto"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline-offset-4 hover:underline"
          >
            RubsNeto
          </a>
          . MIT License · v1.0
        </p>

        <div className="flex items-center gap-5 text-[12.5px] text-white/45">
          <a
            href="https://github.com/RubsNeto/mesp-pet"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-white"
          >
            GitHub
          </a>
          <a
            href="https://github.com/RubsNeto/mesp-pet/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-white"
          >
            Issues
          </a>
          <a
            href="https://github.com/RubsNeto/mesp-pet/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-white"
          >
            License
          </a>
        </div>
      </div>
    </motion.footer>
  );
}
