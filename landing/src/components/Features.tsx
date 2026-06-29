'use client';

import { motion } from 'motion/react';
import { MespCanvas } from './MespCanvas';
import { REPO_URL } from '@/lib/site';

interface FeatureCardProps {
  index: number;
  className?: string;
  children: React.ReactNode;
}

function FeatureCard({ index, className = '', children }: FeatureCardProps) {
  return (
    <motion.article
      initial={{ y: 30, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay: index * 0.06, ease: 'easeOut' }}
      className={`group relative overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.015] p-7 transition duration-500 hover:border-white/15 hover:bg-white/[0.03] ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition duration-700 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(800px circle at 50% 50%, rgba(255,255,255,0.05), transparent 40%)',
        }}
      />
      <div className="absolute left-6 right-6 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-white/40 to-transparent transition duration-500 group-hover:scale-x-100" />
      <div className="relative">{children}</div>
    </motion.article>
  );
}

export function Features() {
  return (
    <section id="features" className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        <motion.header
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="mx-auto mb-20 max-w-2xl text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/35">
            Por que MESP
          </span>
          <h2 className="mt-3 font-display text-[clamp(32px,5vw,56px)] font-semibold leading-[1.05] tracking-[-0.03em]">
            Pequeno detalhe.{' '}
            <span className="grad-text-vivid">Grande companhia.</span>
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-white/55 sm:text-[17px]">
            Tudo que sua sessão de IA precisa pra parecer menos
            terminal frio e mais um pet companion divertido.
          </p>
        </motion.header>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          {/* Big card: Reativo */}
          <FeatureCard index={0} className="md:col-span-2 lg:col-span-4 lg:row-span-2">
            <div className="flex h-full flex-col">
              <div className="flex flex-1 items-center justify-center py-8">
                <div className="relative">
                  <div
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-amber-300/20 to-rose-400/15 blur-2xl"
                  />
                  <div className="mesp-float">
                    <MespCanvas
                      size={224}
                      opts={{
                        family: 'peach',
                        accessory: 'flower',
                        spots: 'belly',
                        eye: 'sparkle',
                        spotColor: '#ffffff',
                      }}
                      animate
                      className="size-44 lg:size-56"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10.5px] uppercase tracking-wider text-emerald-300/80">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Auto-detect
                </div>
                <h3 className="font-display text-[26px] font-semibold leading-tight tracking-tight">
                  Reage à sua IA favorita
                </h3>
                <p className="max-w-md text-[15px] leading-relaxed text-white/55">
                  O MESP lê o output do agente em tempo real e detecta os
                  estados — pensando, executando, sucesso ou falha. Você não
                  precisa configurar nada.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {[
                    'Kiro CLI',
                    'Claude Code',
                    'Aider',
                    'Codex',
                    'Gemini',
                    'Cursor',
                    'Copilot',
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-white/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </FeatureCard>

          {/* Terminal */}
          <FeatureCard index={1} className="lg:col-span-2">
            <Icon>
              <path
                fill="currentColor"
                d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"
              />
            </Icon>
            <h3 className="mt-5 font-display text-[19px] font-semibold tracking-tight">
              Terminal real
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-white/55">
              xterm.js + node-pty embutido. Persistente por pet.
              É literalmente seu shell.
            </p>
          </FeatureCard>

          {/* Auto-start */}
          <FeatureCard index={2} className="lg:col-span-2">
            <Icon>
              <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z"
              />
            </Icon>
            <h3 className="mt-5 font-display text-[19px] font-semibold tracking-tight">
              Auto-start
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-white/55">
              Liga o PC, MESP já está lá. Janela transparente sempre no topo.
            </p>
          </FeatureCard>

          {/* Variações com canvas */}
          <FeatureCard index={3} className="md:col-span-2 lg:col-span-3">
            <div className="mb-5 flex items-end justify-around gap-2 pt-4">
              <MespCanvas
                size={64}
                opts={{ family: 'mint', accessory: 'ears', spots: 'none', eye: 'open' }}
                animate
                className="size-16 transition hover:-translate-y-1"
              />
              <MespCanvas
                size={72}
                opts={{ family: 'rose', accessory: 'bow', spots: 'none', eye: 'open' }}
                animate
                className="size-20 transition hover:-translate-y-1"
              />
              <div className="mesp-float">
                <MespCanvas
                  size={80}
                  opts={{ family: 'sky', accessory: 'star', spots: 'none', eye: 'sparkle' }}
                  animate
                  className="size-20"
                />
              </div>
              <MespCanvas
                size={72}
                opts={{ family: 'lilac', accessory: 'halo', spots: 'none', eye: 'open' }}
                animate
                className="size-20 transition hover:-translate-y-1"
              />
              <MespCanvas
                size={64}
                opts={{ family: 'lemon', accessory: 'horns', spots: 'none', eye: 'open' }}
                animate
                className="size-16 transition hover:-translate-y-1"
              />
            </div>
            <h3 className="font-display text-[19px] font-semibold tracking-tight">
              Cada MESP é único
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-white/55">
              12 famílias de cor, 7 acessórios, 4 padrões. Geração procedural
              em código. Spawn quantos quiser.
            </p>
          </FeatureCard>

          {/* Carinho */}
          <FeatureCard index={4} className="lg:col-span-3">
            <div className="flex items-center gap-5">
              <div>
                <h3 className="font-display text-[19px] font-semibold tracking-tight">
                  Faça carinho 🤍
                </h3>
                <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-white/55">
                  Clique e segure pra ver corações. 4 cliques rápidos = susto.
                  Drop bolinha 🎾.
                </p>
              </div>
              <div className="ml-auto">
                <MespCanvas
                  size={88}
                  opts={{ family: 'rose', accessory: 'flower', spots: 'heart', eye: 'sparkle', spotColor: '#ffffff' }}
                  animate
                  className="size-20"
                />
              </div>
            </div>
          </FeatureCard>

          {/* Local */}
          <FeatureCard index={5} className="md:col-span-2 lg:col-span-6">
            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div>
                <Icon>
                  <path
                    fill="currentColor"
                    d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"
                  />
                </Icon>
                <h3 className="mt-5 font-display text-[19px] font-semibold tracking-tight">
                  100% local · zero telemetria · MIT
                </h3>
                <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/55">
                  Sem cadastro, sem servidor, sem tracking. Roda direto no
                  seu PC. O código está aberto e auditável no GitHub.
                </p>
              </div>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 text-[13px] font-medium text-white transition hover:border-white/25 hover:bg-white/[0.06]"
              >
                Ver código no GitHub
                <svg viewBox="0 0 24 24" className="size-3">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 17L17 7M7 7h10v10"
                  />
                </svg>
              </a>
            </div>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/85">
      <svg viewBox="0 0 24 24" className="size-5">
        {children}
      </svg>
    </div>
  );
}
