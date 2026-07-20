// src/components/KiroChatPanel.tsx
//
// Terminal real (xterm.js) conectado a uma CLI de IA via processo persistente.
// Suporta presets para Claude Code, Aider, Gemini, Codex, Kiro, GitHub Copilot,
// e configuração personalizada.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import type { PetEntity, PetState } from '../types';
import { AI_PRESETS, findPresetByCommand, getPresetById } from '../services/aiPresets';
import {
  stripAnsi,
  matchState,
  matchThinking,
  getMarkersForCommand,
} from '../services/stateDetect';
import { applyTransition, attachCost, trimRuns, activeRun } from '../services/runLog';
import { buildPrimer } from '../services/primer';
import { loadContext } from '../services/contextStore';
import { budgetExceeded } from '../services/settingsCore';
import type { RunRecord } from '../services/runLog';
import { parseCostLine, aggregateCost, formatCost } from '../services/costParse';
import { loadSettings, onSettingsChanged } from '../services/settingsStore';
import { ContextTab } from './ContextTab';
import { HistoryTab } from './HistoryTab';
import { SettingsSection } from './SettingsSection';
import { getSpritesForTraits } from '../assets/sprites';
import { subscribeMousePosition } from '../hooks/useMousePosition';
import { MespCodeChat } from './MespCodeChat';
import type { MespCodeStatus } from './MespCodeChat';

export interface KiroChatPanelProps {
  pet: PetEntity;
  /** Quando false, o painel é renderizado mas escondido (display:none).
   *  O processo PTY continua rodando. */
  visible: boolean;
  /** Esconde a UI (não mata o processo). */
  onClose: () => void;
  /** Callback opcional para refletir estado do CLI no MESP. */
  onPetStateChange?: (state: PetState) => void;
}

const PANEL_WIDTH = 820;
const PANEL_HEIGHT = 540;
const MARGIN = 12;
const HEADER_SPRITE_SCALE = 54 / 96;

type TermStatus = 'disconnected' | 'connecting' | 'connected';

const PET_STATE_LABELS: Record<PetState, string> = {
  idle: 'pronto',
  walking: 'explorando',
  thinking: 'pensando',
  working: 'trabalhando',
  waiting: 'precisa de voce',
  success: 'concluido',
  error: 'atencao',
  sleeping: 'descansando',
  sitting: 'observando',
};

const ROUTE_PROVIDER_NAMES: Record<string, string> = {
  cx: 'Codex',
  kr: 'Kiro',
  gh: 'GitHub',
};

function describeModel(model: string | null | undefined): { provider: string; model: string } {
  if (!model) return { provider: '9Router', model: 'modelo automatico' };
  const clean = model.replace(/^9router\//i, '');
  const [prefix, ...rest] = clean.split('/');
  if (rest.length > 0) {
    return {
      provider: ROUTE_PROVIDER_NAMES[prefix] || prefix.toUpperCase(),
      model: rest.join('/'),
    };
  }
  return { provider: '9Router', model: clean };
}

// ----- Copiar / colar -------------------------------------------------------

/** Copia a seleção atual do terminal para o clipboard do sistema. */
async function copySelection(term: Terminal): Promise<void> {
  const sel = term.getSelection();
  if (!sel) return;
  try {
    if (window.mesp?.clipboardWriteText) await window.mesp.clipboardWriteText(sel);
    else await navigator.clipboard.writeText(sel);
  } catch {
    /* noop */
  }
}

/** Envolve um caminho em aspas se ele contiver espaços. */
function quotePathIfNeeded(p: string): string {
  return /\s/.test(p) ? `"${p}"` : p;
}

/**
 * Cola o conteúdo do clipboard no terminal.
 *   1. Se houver uma imagem, salva em arquivo temporário e cola o caminho
 *      (CLIs de IA como Claude Code aceitam o caminho de uma imagem).
 *   2. Caso contrário, cola o texto.
 * `term.paste` respeita bracketed-paste do PTY.
 */
async function pasteIntoTerminal(term: Terminal): Promise<void> {
  try {
    const imgPath = await window.mesp?.clipboardSaveImage?.();
    if (imgPath) {
      term.paste(quotePathIfNeeded(imgPath));
      return;
    }
  } catch {
    /* noop */
  }
  try {
    let text = '';
    if (window.mesp?.clipboardReadText) text = await window.mesp.clipboardReadText();
    else text = await navigator.clipboard.readText();
    if (text) term.paste(text);
  } catch {
    /* noop */
  }
}

export function KiroChatPanel({ pet, visible, onClose, onPetStateChange }: KiroChatPanelProps) {
  const [status, setStatus] = useState<TermStatus>('disconnected');
  const [commandInfo, setCommandInfo] = useState<{ cmd: string; args: string[] }>({
    cmd: '9code',
    args: [],
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [editCmd, setEditCmd] = useState('9code');
  const [editArgs, setEditArgs] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('mesp-code');
  const [installedPresets, setInstalledPresets] = useState<Record<string, boolean>>({});
  const [openCodeStatus, setOpenCodeStatus] = useState<MespCodeStatus | null>(null);
  // Cockpit: sub-aba ativa do overlay + execucoes (runs) + transcript p/ export.
  const [panelTab, setPanelTab] = useState<'config' | 'context' | 'history'>('config');
  const [runs, setRuns] = useState<RunRecord[]>(() => loadRuns(pet.id));
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const transcriptRef = useRef('');
  const primerDoneRef = useRef(false);
  const budgetNotifiedRef = useRef(false);
  const stuckNotifiedRef = useRef(false);
  const lastOutputAtRef = useRef(0);
  const updateRunsRef = useRef<(updater: (r: RunRecord[]) => RunRecord[]) => void>(() => {});

  const currentPreset = useMemo(
    () => findPresetByCommand(commandInfo.cmd, commandInfo.args),
    [commandInfo.cmd, commandInfo.args],
  );
  const isMespCode =
    currentPreset?.id === 'mesp-code' ||
    /(^|[\\/])(?:9code|opencode)(?:\.(?:cmd|exe))?$/i.test(commandInfo.cmd);
  const mespSpriteSet = getSpritesForTraits(pet.traits);
  // O mascote compacto sempre usa o frame de olho aberto. O estado continua
  // visivel pelo badge, glow e pelo pet principal, sem sumir durante piscadas.
  const mespFrame = mespSpriteSet.frames.idle[0]!;
  const mespEye = mespSpriteSet.eye[mespFrame] ?? null;
  const modelInfo = describeModel(openCodeStatus?.model);
  const headerConnection = isMespCode
    ? openCodeStatus?.routerState === 'ready'
      ? { className: 'connected', label: 'conectado' }
      : openCodeStatus?.routerState === 'unknown' || !openCodeStatus
        ? { className: 'connecting', label: 'verificando...' }
        : openCodeStatus.routerState === 'unauthorized'
          ? { className: 'disconnected', label: 'autenticacao recusada' }
          : openCodeStatus.routerState === 'misconfigured'
            ? { className: 'disconnected', label: 'nao configurado' }
            : { className: 'disconnected', label: 'indisponivel' }
    : {
        className: status,
        label:
          status === 'connected'
            ? 'conectado'
            : status === 'connecting'
              ? 'conectando...'
              : 'desconectado',
      };
  const workspaceName = pet.workDir?.split(/[\\/]/).filter(Boolean).pop() || 'diretorio atual';
  // Custo acumulado da sessao (soma das execucoes), formatado p/ o header.
  const aggCost = useMemo(() => formatCost(aggregateCost(runs)), [runs]);

  // Ref estável para onPetStateChange — evita re-spawn do PTY a cada render
  // do PetManager (a prop costuma ser arrow inline).
  const petStateChangeRef = useRef(onPetStateChange);
  useLayoutEffect(() => {
    petStateChangeRef.current = onPetStateChange;
  }, [onPetStateChange]);

  const containerRef = useRef<HTMLDivElement>(null);
  const headerAvatarRef = useRef<HTMLDivElement>(null);
  const headerPupilRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);
  const writeKeyRef = useRef<((data: string) => void) | null>(null);
  const resizeRef = useRef<((cols: number, rows: number) => void) | null>(null);
  // Visibilidade atual, lida via ref para não forçar re-run do efeito de spawn
  // (que mataria/recriaria o PTY a cada vez que o painel é aberto/fechado).
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // Spawn pendente — o efeito monta os listeners de imediato, mas só dispara o
  // PTY quando o painel aparece pela 1ª vez, garantindo dimensões reais.
  const spawnFnRef = useRef<(() => void) | null>(null);

  // Replica o comportamento da pupila do personagem no mascote do painel:
  // mesma cor, brilho, proporcao e deslocamento em direcao ao cursor.
  useEffect(() => {
    if (!mespEye) return;
    const update = (mouseX: number, mouseY: number) => {
      const avatar = headerAvatarRef.current;
      if (!avatar) return;
      const rect = avatar.getBoundingClientRect();
      const pupilSize = mespEye.size * HEADER_SPRITE_SCALE;
      for (let index = 0; index < mespEye.slots.length; index += 1) {
        const slot = mespEye.slots[index]!;
        const pupil = headerPupilRefs.current[index];
        if (!pupil) continue;
        const centerX = 1 + slot.cx * HEADER_SPRITE_SCALE;
        const centerY = 1 + slot.cy * HEADER_SPRITE_SCALE;
        let dx = mouseX - (rect.left + centerX);
        let dy = mouseY - (rect.top + centerY);
        const distance = Math.hypot(dx, dy);
        const factor = distance > 0 ? Math.min(1, distance / 80) : 0;
        if (distance > 0) {
          dx = (dx / distance) * factor;
          dy = (dy / distance) * factor;
        }
        const left = centerX + dx * slot.rx * HEADER_SPRITE_SCALE - pupilSize / 2;
        const top = centerY + dy * slot.ry * HEADER_SPRITE_SCALE - pupilSize / 2;
        pupil.style.left = `${left}px`;
        pupil.style.top = `${top}px`;
      }
    };
    return subscribeMousePosition(update);
  }, [mespEye]);

  // Atualiza a lista de execucoes (imutavel) e persiste por pet.
  const updateRuns = useCallback(
    (updater: (r: RunRecord[]) => RunRecord[]) => {
      setRuns((prev) => {
        const next = trimRuns(updater(prev));
        runsRef.current = next;
        saveRuns(pet.id, next);
        return next;
      });
    },
    [pet.id],
  );
  useLayoutEffect(() => {
    updateRunsRef.current = updateRuns;
  }, [updateRuns]);

  const insertIntoTerminal = useCallback((text: string) => {
    const term = termRef.current;
    if (!term || !text) return;
    term.paste(text);
    term.focus();
    setShowConfig(false);
  }, []);

  const clearRuns = useCallback(() => {
    setRuns([]);
    runsRef.current = [];
    saveRuns(pet.id, []);
  }, [pet.id]);

  const exportTranscript = useCallback(() => {
    if (!window.mesp?.saveTextFile) return;
    const clean = stripAnsi(transcriptRef.current || '');
    const header = `# MESP transcript - ${pet.id}\n\nComando: ${commandInfo.cmd} ${commandInfo.args.join(' ')}\nData: ${new Date().toISOString()}\n\n`;
    const body = '```\n' + clean.slice(-200000) + '\n```\n';
    void window.mesp.saveTextFile({
      content: header + body,
      defaultName: `mesp-${pet.id}-${Date.now()}.md`,
    });
  }, [pet.id, commandInfo.cmd, commandInfo.args]);

  // Aplica a fonte do terminal a partir das settings (e reage a mudancas).
  useEffect(() => {
    const apply = () => {
      const term = termRef.current;
      if (!term) return;
      try {
        term.options.fontSize = loadSettings().appearance.terminalFontSize;
      } catch {
        /* noop */
      }
      try {
        fitRef.current?.fit();
      } catch {
        /* noop */
      }
    };
    apply();
    return onSettingsChanged(apply);
  }, []);

  // Auto-primer: ao conectar, injeta contexto do projeto (se habilitado).
  useEffect(() => {
    if (status !== 'connected' || primerDoneRef.current) return;
    primerDoneRef.current = true;
    const s = loadSettings();
    if (!s.behavior.autoPrimer || !pet.workDir) return;
    const primer = buildPrimer(loadContext(pet.workDir));
    if (primer) {
      window.setTimeout(() => termRef.current?.paste(primer), 400);
    }
  }, [status, pet.workDir]);

  // Alerta de orcamento: notifica uma vez quando o custo passa do limite.
  useEffect(() => {
    const usd = aggregateCost(runs).usd || 0;
    const s = loadSettings();
    if (budgetExceeded(s, usd) && !budgetNotifiedRef.current) {
      budgetNotifiedRef.current = true;
      if (window.mesp?.notify) {
        void window.mesp.notify({
          title: 'Orcamento estourado',
          body: `Custo da sessao: $${usd.toFixed(2)} (limite $${s.notifications.costBudgetUsd}).`,
          force: true,
        });
      }
    }
  }, [runs]);

  // O launcher 9code atualiza este arquivo ao iniciar. Relemos apenas os
  // metadados publicos para refletir modelos novos sem reiniciar o MESP.
  useEffect(() => {
    if (!visible || !isMespCode || !window.mesp?.getOpenCodeStatus) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await window.mesp!.getOpenCodeStatus();
        if (!cancelled) setOpenCodeStatus(next);
      } catch {
        if (!cancelled) setOpenCodeStatus(null);
      }
    };
    void refresh();
    const id = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [visible, isMespCode, status]);

  useEffect(() => {
    if (isMespCode) setStatus('connected');
  }, [isMespCode]);

  // Deteccao de "travado": agente ocupado sem produzir saida por N minutos.
  useEffect(() => {
    const id = setInterval(() => {
      const s = loadSettings();
      const mins = s.notifications.stuckAlertMin;
      if (!mins) {
        stuckNotifiedRef.current = false;
        return;
      }
      const open = activeRun(runsRef.current);
      if (!open) {
        stuckNotifiedRef.current = false;
        return;
      }
      const idleMs = Date.now() - (lastOutputAtRef.current || open.startedAt);
      if (idleMs > mins * 60000 && !stuckNotifiedRef.current) {
        stuckNotifiedRef.current = true;
        if (window.mesp?.notify) {
          void window.mesp.notify({
            title: 'Agente parado?',
            body: `Sem saida ha ${Math.round(idleMs / 60000)} min.`,
          });
        }
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Carrega config do .env. Só depois disso o spawn é tentado.
  useEffect(() => {
    if (!window.mesp?.getConfig) {
      setConfigLoaded(true); // browser puro, segue com defaults
      return;
    }
    void window.mesp
      .getConfig()
      .then((cfg) => {
        const args = (cfg.kiroTaskPrefix || '').split(' ').filter(Boolean);
        const cmd = cfg.kiroCommand || '9code';
        setCommandInfo({ cmd, args });
        setEditCmd(cmd);
        setEditArgs(args.join(' '));
        const preset = findPresetByCommand(cmd, args);
        setSelectedPresetId(preset?.id ?? 'custom');
        setConfigLoaded(true);
      })
      .catch(() => {
        setConfigLoaded(true);
      });
  }, []);

  // Quando abre o painel de config, detecta quais CLIs estão instaladas.
  useEffect(() => {
    if (!showConfig) return;
    if (!window.mesp?.checkCommand) return;
    let cancelled = false;
    const detect = async () => {
      const results: Record<string, boolean> = {};
      for (const preset of AI_PRESETS) {
        if (preset.id === 'custom' || !preset.command) continue;
        if (cancelled) return;
        try {
          results[preset.id] = await window.mesp!.checkCommand(preset.command);
        } catch {
          results[preset.id] = false;
        }
      }
      if (!cancelled) setInstalledPresets(results);
    };
    void detect();
    return () => {
      cancelled = true;
    };
  }, [showConfig]);

  const handlePresetChange = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = getPresetById(presetId);
    if (!preset || preset.id === 'custom') return;
    setEditCmd(preset.command);
    setEditArgs(preset.args.join(' '));
  }, []);

  // Cria o terminal xterm uma única vez.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace',
      fontSize: 11,
      lineHeight: 1.3,
      scrollback: 5000,
      allowProposedApi: true,
      theme: {
        // MESP Night: alto contraste, acentos do pet e fundo OLED suave.
        background: '#111321',
        foreground: '#dce1f7',
        cursor: '#82d9f7',
        cursorAccent: '#111321',
        selectionBackground: 'rgba(130, 217, 247, 0.2)',
        black: '#24283b',
        red: '#f58aa8',
        green: '#8ee6b2',
        yellow: '#f3ce83',
        blue: '#82b8f7',
        magenta: '#c7a0f5',
        cyan: '#82d9f7',
        white: '#dce1f7',
        brightBlack: '#66708f',
        brightRed: '#ff9db8',
        brightGreen: '#a6f0c3',
        brightYellow: '#ffe09d',
        brightBlue: '#9cc9ff',
        brightMagenta: '#dabaff',
        brightCyan: '#a5e9ff',
        brightWhite: '#f4f6ff',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(
      new WebLinksAddon((_e, uri) => {
        if (window.mesp?.openExternal) void window.mesp.openExternal(uri);
        else window.open(uri, '_blank');
      }),
    );
    term.open(containerRef.current);
    fit.fit();

    // Atalhos de copiar/colar (sem quebrar Ctrl+C como SIGINT):
    //   • Ctrl+V / Ctrl+Shift+V / Cmd+V  -> cola texto OU imagem do clipboard
    //   • Ctrl+Shift+C / Cmd+C           -> copia a seleção
    //   • Ctrl+C com seleção ativa       -> copia (sem seleção, vira SIGINT)
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const key = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && key === 'v') {
        // Importante: o xterm, ao receber `false` do custom handler, NÃO chama
        // preventDefault no keydown. Sem isso, o navegador dispara o evento
        // `paste` nativo e o xterm cola o conteúdo do clipboard de novo — o que
        // duplica a colagem (no Windows o clipboard de uma imagem traz bitmap
        // E texto). Chamamos preventDefault para que o nosso paste seja a única
        // fonte e a imagem/texto entre uma só vez.
        e.preventDefault();
        e.stopPropagation();
        void pasteIntoTerminal(term);
        return false;
      }
      if ((e.ctrlKey && e.shiftKey && key === 'c') || (e.metaKey && key === 'c')) {
        void copySelection(term);
        term.clearSelection();
        return false;
      }
      if (e.ctrlKey && !e.shiftKey && key === 'c' && term.hasSelection()) {
        void copySelection(term);
        term.clearSelection();
        return false;
      }
      return true;
    });

    termRef.current = term;
    fitRef.current = fit;

    // Input do usuário: envia direto ao stdin do processo.
    term.onData((data) => {
      const send = writeKeyRef.current;
      if (send) send(data);
    });

    // Resize do xterm -> resize do PTY (informa o processo da nova largura/altura).
    term.onResize(({ cols, rows }) => {
      const r = resizeRef.current;
      if (r) r(cols, rows);
    });

    // Resize observer: refit quando o painel mudar de tamanho.
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* noop */
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Foca o terminal ao montar.
  useEffect(() => {
    const t = setTimeout(() => termRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Quando o painel vira visível (de display:none para visível), o fitAddon
  // precisa recalcular as dimensões e o terminal precisa ganhar foco.
  // É também aqui que disparamos o spawn na 1ª exibição: enquanto o painel está
  // com display:none, o fit mede dimensão zero e o PTY nasceria com 80x24,
  // cortando as respostas dos agentes TUI (Claude Code, Kiro, etc.).
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* noop */
      }
      termRef.current?.focus();
      // Faz o spawn agora, já com as dimensões reais do painel.
      spawnFnRef.current?.();
    }, 30);
    return () => clearTimeout(t);
  }, [visible]);

  // Conecta ao processo e plumbing entre xterm <-> processo.
  // IMPORTANTE: aguarda config carregar antes de tentar spawn, senão usa
  // valores padrão (kiro-cli) que podem não existir e mostrar "desconectado".
  useEffect(() => {
    if (!configLoaded) return;
    if (isMespCode) return;
    if (!window.mesp?.terminalSpawn) return;
    const term = termRef.current;
    if (!term) return;

    const petId = pet.id;

    // Spawn do PTY. Adiado até o painel ficar visível: enquanto está oculto
    // (display:none) o fit mede dimensão zero e o processo nasceria em 80x24,
    // o que faz os agentes TUI (Claude Code, Kiro, Aider, Gemini…) cortarem as
    // respostas longas. Spawnar com o painel visível garante o tamanho real.
    let didSpawn = false;
    const doSpawn = () => {
      if (didSpawn) return;
      didSpawn = true;
      connectedRef.current = false;
      setStatus('connecting');
      // Recalcula as dimensões imediatamente antes do spawn.
      try {
        fitRef.current?.fit();
      } catch {
        /* noop */
      }
      const cmdLine = `\x1b[90m$ ${commandInfo.cmd}${commandInfo.args.length ? ' ' + commandInfo.args.join(' ') : ''}\x1b[0m\r\n`;
      term.write(cmdLine);

      restorePreviousBuffer(term, petId);

      if (pet.workDir) {
        term.write(`\x1b[90m  cwd: ${pet.workDir}\x1b[0m\r\n`);
      }

      void window
        .mesp!.terminalSpawn({
          petId,
          command: commandInfo.cmd,
          args: commandInfo.args,
          cwd: pet.workDir ?? undefined,
          cols: term.cols,
          rows: term.rows,
        })
        .then((res) => {
          if (res.ok) {
            connectedRef.current = true;
            setStatus('connected');
            // Habilita envio de input ao stdin.
            writeKeyRef.current = (data: string) => {
              void window.mesp!.terminalWrite(petId, data);
            };
            // Habilita propagação de resize ao PTY.
            resizeRef.current = (cols: number, rows: number) => {
              void window.mesp!.terminalResize(petId, cols, rows);
            };
            // Sincroniza o PTY com o tamanho atual do xterm. Cobre o caso em que
            // o fit mudou as dimensões entre a chamada de spawn e o resolve — sem
            // isso, esse resize se perderia (o resizeRef só existe a partir daqui)
            // e o agente continuaria achando que tem o tamanho antigo.
            try {
              fitRef.current?.fit();
            } catch {
              /* noop */
            }
            void window.mesp!.terminalResize(petId, term.cols, term.rows);
            // Foca o terminal logo após conectar.
            setTimeout(() => term.focus(), 30);
          } else {
            term.write(`\r\n\x1b[31m✗ Falha ao iniciar: ${res.error || 'desconhecido'}\x1b[0m\r\n`);
            setStatus('disconnected');
          }
        });
    };

    // Detector de estado plugável por preset. As regexes vivem no módulo puro
    // ../services/stateDetect (testado em tests/stateDetect.test.mjs). Aqui só
    // ficam os timers de transição e o buffer de linhas.
    let stateTimer: ReturnType<typeof setTimeout> | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let currentDetectedState: PetState = 'idle';
    let lineBuffer = '';

    const setState = (next: PetState) => {
      if (next === currentDetectedState) return;
      currentDetectedState = next;
      petStateChangeRef.current?.(next);
      updateRunsRef.current((r) => applyTransition(r, next, Date.now()));

      if (stateTimer) clearTimeout(stateTimer);
      if (safetyTimer) clearTimeout(safetyTimer);

      // Timer "natural" pra voltar pra idle.
      const backToIdleMs =
        next === 'success'
          ? 2500
          : next === 'error'
            ? 3000
            : next === 'waiting'
              ? 120000 // aguardando o usuário: persiste bastante
              : next === 'working'
                ? 8000
                : 12000; // thinking
      stateTimer = setTimeout(() => {
        currentDetectedState = 'idle';
        petStateChangeRef.current?.('idle');
      }, backToIdleMs);

      // Safety: nunca deixar travado fora de idle por mais de N s (mais longo
      // para 'waiting', que legitimamente pode durar bastante).
      const safetyMs = next === 'waiting' ? 180000 : 30000;
      safetyTimer = setTimeout(() => {
        if (currentDetectedState !== 'idle') {
          currentDetectedState = 'idle';
          petStateChangeRef.current?.('idle');
        }
      }, safetyMs);
    };

    // Detecta padrões linha-a-linha. Acumula chunks até bater \n e processa.
    const markers = getMarkersForCommand(commandInfo.cmd);
    const detectState = (raw: string) => {
      const cleaned = stripAnsi(raw);
      lineBuffer += cleaned;

      // Spinner de "thinking" chega sem newline — detecta imediatamente.
      if (matchThinking(cleaned, markers)) {
        setState('thinking');
        return;
      }

      // Quebra linhas completas para análise.
      const newlineIdx = lineBuffer.lastIndexOf('\n');
      if (newlineIdx === -1 && lineBuffer.length < 300) return;

      const completeLines = newlineIdx >= 0 ? lineBuffer.slice(0, newlineIdx) : lineBuffer;
      lineBuffer = newlineIdx >= 0 ? lineBuffer.slice(newlineIdx + 1) : '';

      const lines = completeLines.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const cost = parseCostLine(trimmed);
        if (cost) updateRunsRef.current((r) => attachCost(r, cost));

        const detected = matchState(trimmed, markers);
        if (detected) {
          setState(detected);
          continue;
        }

        // Sem marcador explícito: se estava "pensando" e veio texto
        // substancial, o agente começou a responder -> working.
        if (currentDetectedState === 'thinking' && trimmed.length > 20) {
          setState('working');
        }
      }
    };

    const offStdout = window.mesp.onTerminalStdout(({ petId: pid, data }) => {
      if (pid !== petId) return;
      term.write(data);
      transcriptRef.current = (transcriptRef.current + data).slice(-500000);
      lastOutputAtRef.current = Date.now();
      detectState(data);
    });
    const offStderr = window.mesp.onTerminalStderr(({ petId: pid, data }) => {
      if (pid !== petId) return;
      term.write(data);
      transcriptRef.current = (transcriptRef.current + data).slice(-500000);
      lastOutputAtRef.current = Date.now();
      detectState(data);
    });
    const offExit = window.mesp.onTerminalExit(({ petId: pid, code, error }) => {
      if (pid !== petId) return;
      connectedRef.current = false;
      writeKeyRef.current = null;
      setStatus('disconnected');
      const msg = error
        ? `\r\n\x1b[31m✗ processo encerrado: ${error}\x1b[0m\r\n`
        : `\r\n\x1b[90m[processo encerrado (code ${code ?? '?'})]\x1b[0m\r\n`;
      term.write(msg);
      petStateChangeRef.current?.('idle');
      if (stateTimer) clearTimeout(stateTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
    });

    // Com os listeners montados, exp\u00f5e o spawn para o efeito de visibilidade e
    // dispara agora se o painel j\u00e1 estiver aberto (ex.: "Salvar e reconectar"
    // com o painel vis\u00edvel, em que este efeito re-roda sem mudar `visible`).
    spawnFnRef.current = doSpawn;
    if (visibleRef.current) doSpawn();

    return () => {
      offStdout();
      offStderr();
      offExit();
      spawnFnRef.current = null;
      writeKeyRef.current = null;
      resizeRef.current = null;
      if (stateTimer) clearTimeout(stateTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      // Mata o PTY ao trocar de comando ou desmontar para evitar processo \u00f3rf\u00e3o.
      if (window.mesp?.terminalKill) {
        void window.mesp.terminalKill(petId);
      }
    };
  }, [pet.id, pet.workDir, commandInfo.cmd, commandInfo.args, configLoaded, isMespCode]);

  // Esc fecha quando o terminal não tem foco; quando tem, deixa o ESC ir pro
  // processo (apps interativas usam ESC).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const termEl = containerRef.current;
      const focused = termEl && termEl.contains(document.activeElement);
      if (!focused) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reconnect = useCallback(() => {
    if (!window.mesp?.terminalSpawn) return;
    const term = termRef.current;
    if (!term) return;
    connectedRef.current = false;
    setStatus('connecting');
    term.reset();
    // Recalcula as dimensões antes do spawn (o painel está visível aqui).
    try {
      fitRef.current?.fit();
    } catch {
      /* noop */
    }
    const cmdLine = `\x1b[90m$ ${commandInfo.cmd}${commandInfo.args.length ? ' ' + commandInfo.args.join(' ') : ''}\x1b[0m\r\n`;
    term.write(cmdLine);
    if (pet.workDir) {
      term.write(`\x1b[90m  cwd: ${pet.workDir}\x1b[0m\r\n`);
    }
    void window.mesp
      .terminalSpawn({
        petId: pet.id,
        command: commandInfo.cmd,
        args: commandInfo.args,
        cwd: pet.workDir ?? undefined,
        cols: term.cols,
        rows: term.rows,
      })
      .then((res) => {
        if (res.ok) {
          connectedRef.current = true;
          setStatus('connected');
          writeKeyRef.current = (data: string) => {
            void window.mesp!.terminalWrite(pet.id, data);
          };
          resizeRef.current = (cols: number, rows: number) => {
            void window.mesp!.terminalResize(pet.id, cols, rows);
          };
          try {
            fitRef.current?.fit();
          } catch {
            /* noop */
          }
          void window.mesp!.terminalResize(pet.id, term.cols, term.rows);
          setTimeout(() => term.focus(), 30);
        } else {
          term.write(
            `\r\n\x1b[31m✗ Falha ao reconectar: ${res.error || 'desconhecido'}\x1b[0m\r\n`,
          );
          setStatus('disconnected');
        }
      });
  }, [pet.id, pet.workDir, commandInfo]);

  const kill = useCallback(() => {
    if (!window.mesp?.terminalKill) return;
    void window.mesp.terminalKill(pet.id);
  }, [pet.id]);

  // Posição do painel (em state pra permitir drag pelo header).
  const [pos, setPos] = useState(() => computePosition());
  const [size, setSize] = useState(() => loadPanelSize());
  const resizeStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dragStateRef = useRef<{ pointerId: number; offX: number; offY: number } | null>(null);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Não inicia drag se clicou em um botão dentro do header.
      if ((e.target as HTMLElement).closest('button')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      dragStateRef.current = {
        pointerId: e.pointerId,
        offX: e.clientX - pos.x,
        offY: e.clientY - pos.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragStateRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const x = Math.max(0, Math.min(winW - sizeRef.current.w, e.clientX - d.offX));
    const y = Math.max(0, Math.min(winH - 40, e.clientY - d.offY));
    setPos({ x, y });
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragStateRef.current;
    if (d && d.pointerId === e.pointerId) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      dragStateRef.current = null;
    }
  }, []);

  const onResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      resizeStateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startW: size.w,
        startH: size.h,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [size.w, size.h],
  );

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeStateRef.current;
    if (!r || r.pointerId !== e.pointerId) return;
    const w = clampNum(r.startW + (e.clientX - r.startX), 420, window.innerWidth - 20);
    const h = clampNum(r.startH + (e.clientY - r.startY), 300, window.innerHeight - 20);
    setSize({ w, h });
  }, []);

  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeStateRef.current;
    if (r && r.pointerId === e.pointerId) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      resizeStateRef.current = null;
    }
  }, []);

  // Persiste o tamanho do painel quando muda.
  useEffect(() => {
    savePanelSize(size);
  }, [size]);

  // Salva o scrollback do terminal periodicamente e ao desmontar.
  useEffect(() => {
    const id = setInterval(() => {
      saveTermBuffer(pet.id, stripAnsi(transcriptRef.current).replace(/\r/g, ''));
    }, 4000);
    return () => {
      clearInterval(id);
      saveTermBuffer(pet.id, stripAnsi(transcriptRef.current).replace(/\r/g, ''));
    };
  }, [pet.id]);

  return (
    <div
      className={`kiro-terminal interactive${isMespCode ? ' mesp-code-terminal' : ''}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        display: visible ? undefined : 'none',
      }}
      role="dialog"
      aria-label={`Terminal MESP ${pet.id}`}
    >
      <div
        className={`kiro-terminal-header${isMespCode ? ' mesp-code-header' : ''}`}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        {isMespCode ? (
          <div className="mesp-code-brand">
            <div
              ref={headerAvatarRef}
              className={`mesp-code-avatar state-${pet.state}`}
              aria-label={`MESP ${PET_STATE_LABELS[pet.state]}`}
            >
              <span className="mesp-code-avatar-glow" aria-hidden="true" />
              <img
                src={mespFrame}
                alt=""
                className="mesp-code-avatar-sprite pixelated"
                draggable={false}
              />
              {mespEye?.slots.map((slot, index) => {
                const pupilSize = mespEye.size * HEADER_SPRITE_SCALE;
                return (
                  <span
                    key={`${index}-${slot.cx}-${slot.cy}`}
                    ref={(element) => {
                      headerPupilRefs.current[index] = element;
                    }}
                    className="pet-pupil mesp-code-pupil"
                    aria-hidden="true"
                    style={{
                      width: pupilSize,
                      height: pupilSize,
                      left: slot.cx * HEADER_SPRITE_SCALE - pupilSize / 2 + 1,
                      top: slot.cy * HEADER_SPRITE_SCALE - pupilSize / 2 + 1,
                      ...(pet.traits?.palette?.pupil
                        ? { background: pet.traits.palette.pupil }
                        : null),
                    }}
                  />
                );
              })}
              {pet.state === 'waiting' && (
                <span className="mesp-code-attention" aria-hidden="true">
                  !
                </span>
              )}
            </div>
            <div className="mesp-code-copy">
              <div className="mesp-code-title-row">
                <strong>MESP CODE</strong>
                <span className={`mesp-code-state state-${pet.state}`} aria-live="polite">
                  {PET_STATE_LABELS[pet.state]}
                </span>
              </div>
              <div
                className="mesp-code-meta"
                title={openCodeStatus?.model || 'Modelo gerenciado pelo 9Router'}
              >
                <span className="mesp-code-provider">{modelInfo.provider}</span>
                <span aria-hidden="true">/</span>
                <span className="mesp-code-model">{modelInfo.model}</span>
                {openCodeStatus && openCodeStatus.modelCount > 0 && (
                  <span className="mesp-code-model-count">{openCodeStatus.modelCount} modelos</span>
                )}
                <span className="mesp-code-workspace">{workspaceName}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="kiro-terminal-title">
            <span className={`terminal-dot status-${status}`} />
            {currentPreset ? `${currentPreset.icon} ${currentPreset.name}` : 'AI Agent'}
            <span className="muted">— {pet.id}</span>
          </div>
        )}
        <div className="terminal-header-actions">
          {aggCost && (
            <span className="terminal-cost" title="Custo acumulado desta sessao">
              {aggCost}
            </span>
          )}
          <span className={`terminal-status ${headerConnection.className}`} aria-live="polite">
            {headerConnection.label}
          </span>
          <button
            className="btn-icon"
            onClick={() => setShowConfig((v) => !v)}
            title="Configurar comando"
            aria-label="Configurar comando"
          >
            ⚙
          </button>
          {!isMespCode && (
            <>
              <button
                className="btn-icon"
                onClick={kill}
                title="Matar processo"
                aria-label="Matar processo"
                disabled={status !== 'connected'}
              >
                ⏹
              </button>
              <button
                className="btn-icon"
                onClick={reconnect}
                title="Reconectar"
                aria-label="Reconectar"
                disabled={status === 'connecting'}
              >
                ↻
              </button>
            </>
          )}
          <button className="btn-icon" onClick={onClose} title="Fechar (Esc)" aria-label="Fechar">
            ×
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="kiro-cockpit">
          <div className="cockpit-tabs">
            <button
              className={`cockpit-tab${panelTab === 'config' ? ' active' : ''}`}
              onClick={() => setPanelTab('config')}
            >
              Config
            </button>
            <button
              className={`cockpit-tab${panelTab === 'context' ? ' active' : ''}`}
              onClick={() => setPanelTab('context')}
            >
              Contexto
            </button>
            <button
              className={`cockpit-tab${panelTab === 'history' ? ' active' : ''}`}
              onClick={() => setPanelTab('history')}
            >
              Historico
            </button>
            <button
              className="cockpit-close"
              onClick={() => setShowConfig(false)}
              title="Voltar ao terminal"
              aria-label="Fechar configuracoes"
            >
              {'\u2715'}
            </button>
          </div>
          {panelTab === 'config' && (
            <>
              <div className="kiro-terminal-config">
                {status === 'disconnected' && (
                  <div className="onboarding-banner">
                    <strong>Vamos comecar</strong>
                    <span>
                      1. Escolha um agente abaixo. 2. Defina a pasta de trabalho no menu do pet. 3.
                      Salve e reconecte.
                    </span>
                  </div>
                )}
                <div className="config-field">
                  <span>Agente de IA</span>
                  <div className="preset-grid">
                    {AI_PRESETS.map((preset) => {
                      const installed = installedPresets[preset.id];
                      const isCustom = preset.id === 'custom';
                      const isSelected = selectedPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`preset-card${isSelected ? ' selected' : ''}${
                            installed === false && !isCustom ? ' not-installed' : ''
                          }`}
                          onClick={() => handlePresetChange(preset.id)}
                          title={
                            isCustom
                              ? preset.description
                              : installed === false
                                ? `${preset.description} (não detectado na PATH)`
                                : preset.description
                          }
                        >
                          {preset.id === 'mesp-code' ? (
                            <span className="preset-icon mesp-preset-icon" aria-hidden="true">
                              <img src={mespFrame} alt="" className="pixelated" draggable={false} />
                            </span>
                          ) : (
                            <span className="preset-icon">{preset.icon}</span>
                          )}
                          <span className="preset-name">{preset.name}</span>
                          {!isCustom && installed === true && (
                            <span className="preset-badge">✓</span>
                          )}
                          {!isCustom && installed === false && (
                            <span className="preset-badge missing">!</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label>
                  <span>Comando</span>
                  <input
                    type="text"
                    value={editCmd}
                    onChange={(e) => {
                      setEditCmd(e.target.value);
                      setSelectedPresetId('custom');
                    }}
                    placeholder="ex: claude, aider, gemini..."
                    spellCheck={false}
                  />
                </label>
                <label>
                  <span>Argumentos</span>
                  <input
                    type="text"
                    value={editArgs}
                    onChange={(e) => {
                      setEditArgs(e.target.value);
                      setSelectedPresetId('custom');
                    }}
                    placeholder="(opcional)"
                    spellCheck={false}
                  />
                </label>
                <div className="config-actions">
                  <span className="config-preview">
                    <code>
                      {editCmd} {editArgs}
                    </code>
                  </span>
                  {currentPreset?.installUrl && installedPresets[currentPreset.id] === false && (
                    <a
                      href={currentPreset.installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                    >
                      Como instalar
                    </a>
                  )}
                  <button
                    className="btn primary"
                    onClick={() => {
                      const newArgs = editArgs.split(' ').filter(Boolean);
                      setCommandInfo({ cmd: editCmd, args: newArgs });
                      setShowConfig(false);
                    }}
                  >
                    Salvar e reconectar
                  </button>
                </div>
              </div>
              <SettingsSection />
            </>
          )}
          {panelTab === 'context' && (
            <ContextTab workDir={pet.workDir} onInsert={insertIntoTerminal} />
          )}
          {panelTab === 'history' && (
            <HistoryTab
              workDir={pet.workDir}
              runs={runs}
              onExport={exportTranscript}
              onClearRuns={clearRuns}
            />
          )}
        </div>
      )}

      {isMespCode && (
        <MespCodeChat
          petId={pet.id}
          workDir={pet.workDir}
          visible={visible}
          status={openCodeStatus}
          onStatusChange={setOpenCodeStatus}
          onPetStateChange={(state) => petStateChangeRef.current?.(state)}
        />
      )}

      <div
        ref={containerRef}
        className={`kiro-terminal-xterm${isMespCode ? ' mesp-code-xterm-hidden' : ''}`}
        aria-hidden={isMespCode}
        onClick={() => termRef.current?.focus()}
        onContextMenu={(e) => {
          // Clique direito: copia se há seleção; senão cola (texto ou imagem).
          e.preventDefault();
          const term = termRef.current;
          if (!term) return;
          if (term.hasSelection()) {
            void copySelection(term);
            term.clearSelection();
          } else {
            void pasteIntoTerminal(term);
          }
        }}
        title="Ctrl+V cola texto ou imagem · Ctrl+Shift+C copia · clique direito copia/cola"
      />
      <div
        className="kiro-resize-handle"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        title="Arrastar para redimensionar"
      />
    </div>
  );
}

// Buffer do terminal (scrollback) persistido por pet, p/ sobreviver a reinicio.
function termBufKey(petId: string): string {
  return `mesp-termbuf-${petId}`;
}
function loadTermBuffer(petId: string): string {
  try {
    return localStorage.getItem(termBufKey(petId)) || '';
  } catch {
    return '';
  }
}
function saveTermBuffer(petId: string, text: string): void {
  try {
    localStorage.setItem(termBufKey(petId), text.slice(-100000));
  } catch {
    /* ignore */
  }
}
function restorePreviousBuffer(term: Terminal, petId: string): void {
  const prev = loadTermBuffer(petId);
  if (!prev) return;
  const tail = prev.split('\n').slice(-200).join('\r\n');
  term.write('\x1b[90m==== sessao anterior ====\x1b[0m\r\n');
  term.write('\x1b[90m' + tail + '\x1b[0m\r\n');
  term.write('\x1b[90m=========================\x1b[0m\r\n');
}

const PANEL_SIZE_KEY = 'mesp-panel-size';
function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function loadPanelSize(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(PANEL_SIZE_KEY);
    if (!raw) return { w: PANEL_WIDTH, h: PANEL_HEIGHT };
    const o = JSON.parse(raw);
    return {
      w: typeof o.w === 'number' ? o.w : PANEL_WIDTH,
      h: typeof o.h === 'number' ? o.h : PANEL_HEIGHT,
    };
  } catch {
    return { w: PANEL_WIDTH, h: PANEL_HEIGHT };
  }
}
function savePanelSize(size: { w: number; h: number }): void {
  try {
    localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(size));
  } catch {
    /* ignore */
  }
}

function runsStorageKey(petId: string): string {
  return `mesp-runs-${petId}`;
}
function loadRuns(petId: string): RunRecord[] {
  try {
    const raw = localStorage.getItem(runsStorageKey(petId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as RunRecord[]) : [];
  } catch {
    return [];
  }
}
function saveRuns(petId: string, runs: RunRecord[]): void {
  try {
    localStorage.setItem(runsStorageKey(petId), JSON.stringify(runs));
  } catch {
    /* ignore */
  }
}

function computePosition(): { x: number; y: number } {
  // Centraliza o terminal na tela. Como é largo (1100px), não cabe lado a lado
  // com o pet de forma confortável.
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 720;
  const x = Math.max(MARGIN, Math.floor((winW - PANEL_WIDTH) / 2));
  const y = Math.max(MARGIN, Math.floor((winH - PANEL_HEIGHT) / 2));
  return { x, y };
}
