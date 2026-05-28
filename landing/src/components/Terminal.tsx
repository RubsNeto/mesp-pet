'use client';

import { motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { MespCanvas } from './MespCanvas';
import type { EyeMode, FamilyName } from '@/lib/mesp-renderer';

type LineKind = 'prompt' | 'info' | 'dim' | 'output' | 'ok' | 'err';
type PetState = 'idle' | 'thinking' | 'working' | 'success';

interface ScriptLine {
  kind: LineKind;
  text: string;
  cmd?: string;
  delay: number;
}

const SCRIPT: ScriptLine[] = [
  { kind: 'prompt', text: '~/projeto $ ', cmd: 'kiro chat "refatora o módulo de auth"', delay: 600 },
  { kind: 'info', text: '🤔  Pensando…', delay: 700 },
  { kind: 'dim', text: '   Lendo src/auth/*.ts (12 arquivos)', delay: 700 },
  { kind: 'dim', text: '   Identificando pontos de acoplamento', delay: 700 },
  { kind: 'info', text: '⚙️   Aplicando mudanças', delay: 600 },
  { kind: 'output', text: '   ✓ src/auth/login.ts', delay: 280 },
  { kind: 'output', text: '   ✓ src/auth/middleware.ts', delay: 280 },
  { kind: 'output', text: '   ✓ src/auth/session.ts', delay: 280 },
  { kind: 'info', text: '🧪  Rodando testes', delay: 600 },
  { kind: 'ok', text: '   ✓ 28 passing', delay: 500 },
  { kind: 'ok', text: '✨ Refatoração concluída em 4.2s', delay: 700 },
];

interface RenderedLine {
  kind: LineKind;
  prefix?: string;
  text: string;
}

const stateMap: Record<LineKind, PetState> = {
  prompt: 'idle',
  info: 'thinking',
  dim: 'working',
  output: 'working',
  ok: 'success',
  err: 'success',
};

const STATE_LOOK: Record<PetState, { family: FamilyName; eye: EyeMode; bodyDy?: number }> = {
  idle: { family: 'sky', eye: 'open' },
  thinking: { family: 'sky', eye: 'confused' },
  working: { family: 'sky', eye: 'open', bodyDy: 0 },
  success: { family: 'mint', eye: 'sparkle', bodyDy: -1 },
};

export function Terminal() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-25%' });
  const [lines, setLines] = useState<RenderedLine[]>([]);
  const [petState, setPetState] = useState<PetState>('idle');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    async function run() {
      for (const line of SCRIPT) {
        if (cancelled) return;
        setPetState(stateMap[line.kind]);

        if (line.kind === 'prompt' && line.cmd) {
          setLines((prev) => [...prev, { kind: 'prompt', prefix: line.text, text: '' }]);
          await sleep(reduce ? 30 : 200);
          for (let i = 0; i < line.cmd.length; i++) {
            if (cancelled) return;
            const ch = line.cmd.slice(0, i + 1);
            setLines((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                kind: 'prompt',
                prefix: line.text,
                text: ch,
              };
              return next;
            });
            await sleep(reduce ? 0 : 28);
          }
          await sleep(reduce ? 30 : line.delay);
        } else {
          setLines((prev) => [...prev, { kind: line.kind, text: line.text }]);
          await sleep(reduce ? 30 : line.delay);
        }
      }
      if (!cancelled) setDone(true);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [inView]);

  const look = STATE_LOOK[petState];

  return (
    <section id="terminal" ref={ref} className="relative px-6 py-32">
      <div className="mx-auto max-w-5xl">
        <motion.header
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="mx-auto mb-14 max-w-2xl text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/35">
            Demo
          </span>
          <h2 className="mt-3 font-display text-[clamp(32px,5vw,52px)] font-semibold leading-[1.05] tracking-[-0.03em]">
            Clique no MESP. Abre o terminal.
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-white/55 sm:text-[17px]">
            ANSI completo, persistente. O MESP lê o output e reage em tempo real.
          </p>
        </motion.header>

        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.97 }}
          whileInView={{ y: 0, opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#0a0c14] shadow-[0_50px_120px_-20px_rgba(0,0,0,0.7)]"
        >
          <div className="pointer-events-none absolute inset-0 rounded-[24px] bg-gradient-to-b from-white/[0.04] to-transparent" />

          {/* chrome */}
          <div className="relative flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-3">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#ffbd2e]" />
            <span className="size-3 rounded-full bg-[#28c940]" />
            <span className="ml-3 font-mono text-[12px] text-white/35">
              ~/projeto · kiro chat
            </span>
          </div>

          {/* body */}
          <div className="relative px-6 py-7 font-mono text-[13.5px] leading-[1.7] text-white/85 sm:text-[14px]">
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-words">
                <LineView line={line} />
              </div>
            ))}
            {done && (
              <span
                aria-hidden
                className="ml-1 inline-block w-[8px] animate-pulse bg-emerald-400"
                style={{ height: '14px', verticalAlign: 'middle' }}
              />
            )}
          </div>

          {/* corner pet */}
          <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-center gap-1.5">
            <div className="mesp-float">
              <MespCanvas
                size={88}
                opts={{
                  family: look.family,
                  accessory: 'none',
                  spots: 'none',
                  eye: look.eye,
                  bodyDy: look.bodyDy,
                }}
                animate
                className="size-20 drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]"
              />
            </div>
            <span className="rounded-full border border-white/10 bg-black/70 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/85">
              {petState}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function LineView({ line }: { line: RenderedLine }) {
  const colorMap: Record<LineKind, string> = {
    prompt: 'text-emerald-300',
    info: 'text-sky-300',
    dim: 'text-white/40',
    output: 'text-white/85',
    ok: 'text-emerald-300',
    err: 'text-rose-300',
  };
  if (line.kind === 'prompt') {
    return (
      <span>
        <span className={colorMap.prompt}>{line.prefix}</span>
        <span className="text-white">{line.text}</span>
      </span>
    );
  }
  return <span className={colorMap[line.kind]}>{line.text}</span>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
