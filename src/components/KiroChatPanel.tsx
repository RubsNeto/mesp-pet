// src/components/KiroChatPanel.tsx
//
// Terminal real (xterm.js) conectado à Kiro CLI via processo persistente.
// xterm.js renderiza ANSI escape codes corretamente (cores, spinners,
// movimentos de cursor). O input do usuário é capturado pelo xterm e enviado
// direto ao stdin do processo — comportamento idêntico a um terminal nativo.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { PetEntity, PetState } from '../types';

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

type TermStatus = 'disconnected' | 'connecting' | 'connected';

export function KiroChatPanel({ pet, visible, onClose, onPetStateChange }: KiroChatPanelProps) {
  const [status, setStatus] = useState<TermStatus>('disconnected');
  const [commandInfo, setCommandInfo] = useState<{ cmd: string; args: string[] }>({
    cmd: 'kiro-cli',
    args: ['chat'],
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [editCmd, setEditCmd] = useState('kiro-cli');
  const [editArgs, setEditArgs] = useState('chat');

  // Ref estável para onPetStateChange — evita re-spawn do PTY a cada render
  // do PetManager (a prop costuma ser arrow inline).
  const petStateChangeRef = useRef(onPetStateChange);
  useLayoutEffect(() => {
    petStateChangeRef.current = onPetStateChange;
  }, [onPetStateChange]);

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);
  const writeKeyRef = useRef<((data: string) => void) | null>(null);
  const resizeRef = useRef<((cols: number, rows: number) => void) | null>(null);

  // Carrega config do .env. Só depois disso o spawn é tentado.
  useEffect(() => {
    if (!window.mesp?.getConfig) {
      setConfigLoaded(true); // browser puro, segue com defaults
      return;
    }
    void window.mesp.getConfig().then((cfg) => {
      const args = (cfg.kiroTaskPrefix || '').split(' ').filter(Boolean);
      const cmd = cfg.kiroCommand || 'kiro-cli';
      setCommandInfo({ cmd, args });
      setEditCmd(cmd);
      setEditArgs(args.join(' '));
      setConfigLoaded(true);
    }).catch(() => {
      setConfigLoaded(true);
    });
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
        // Catppuccin Mocha
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        cursorAccent: '#1e1e2e',
        selectionBackground: 'rgba(245, 224, 220, 0.2)',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

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
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      try { fitRef.current?.fit(); } catch { /* noop */ }
      termRef.current?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [visible]);

  // Conecta ao processo e plumbing entre xterm <-> processo.
  // IMPORTANTE: aguarda config carregar antes de tentar spawn, senão usa
  // valores padrão (kiro-cli) que podem não existir e mostrar "desconectado".
  useEffect(() => {
    if (!configLoaded) return;
    if (!window.mesp?.terminalSpawn) return;
    const term = termRef.current;
    if (!term) return;

    const petId = pet.id;
    connectedRef.current = false;
    setStatus('connecting');
    const cmdLine = `\x1b[90m$ ${commandInfo.cmd}${commandInfo.args.length ? ' ' + commandInfo.args.join(' ') : ''}\x1b[0m\r\n`;
    term.write(cmdLine);

    void window.mesp
      .terminalSpawn({
        petId,
        command: commandInfo.cmd,
        args: commandInfo.args,
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
          // Foca o terminal logo após conectar.
          setTimeout(() => term.focus(), 30);
        } else {
          term.write(`\r\n\x1b[31m✗ Falha ao iniciar: ${res.error || 'desconhecido'}\x1b[0m\r\n`);
          setStatus('disconnected');
        }
      });

    // Detector heurístico de estado a partir do output da Kiro CLI.
    // Mantém timer pra voltar para idle após N ms sem novidade.
    let stateTimer: ReturnType<typeof setTimeout> | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let currentDetectedState: PetState = 'idle';
    let lineBuffer = '';

    const setState = (next: PetState) => {
      if (next === currentDetectedState) return;
      currentDetectedState = next;
      petStateChangeRef.current?.(next);

      if (stateTimer) clearTimeout(stateTimer);
      if (safetyTimer) clearTimeout(safetyTimer);

      // Timer "natural" pra voltar pra idle.
      const backToIdleMs =
        next === 'success' ? 2500 :
        next === 'error' ? 3000 :
        next === 'working' ? 6000 :
        12000; // thinking
      stateTimer = setTimeout(() => {
        currentDetectedState = 'idle';
        petStateChangeRef.current?.('idle');
      }, backToIdleMs);

      // Safety: nunca deixar travado fora de idle por mais de 30s.
      safetyTimer = setTimeout(() => {
        if (currentDetectedState !== 'idle') {
          currentDetectedState = 'idle';
          petStateChangeRef.current?.('idle');
        }
      }, 30000);
    };

    // Detecta padrões linha-a-linha. Acumula chunks até bater \n e processa.
    const detectState = (raw: string) => {
      // Remove códigos ANSI para regex limpo.
      // eslint-disable-next-line no-control-regex
      const cleaned = raw.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
      lineBuffer += cleaned;

      // Detecta spinner (Braille) IMEDIATAMENTE, não precisa esperar nova linha.
      if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*Thinking/.test(cleaned)) {
        setState('thinking');
        return;
      }

      // Quebra linhas completas para análise.
      const newlineIdx = lineBuffer.lastIndexOf('\n');
      if (newlineIdx === -1 && lineBuffer.length < 300) return;

      const completeLines = newlineIdx >= 0
        ? lineBuffer.slice(0, newlineIdx)
        : lineBuffer;
      lineBuffer = newlineIdx >= 0 ? lineBuffer.slice(newlineIdx + 1) : '';

      const lines = completeLines.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Erro: linha começa com ✗ ou contém "Error:" no início (case-sensitive).
        if (/^[✗❌]/.test(trimmed) || /^(Error|ERROR):/.test(trimmed)) {
          setState('error');
          continue;
        }

        // Resposta completa: padrão "Credits: X • Time: Ys" ou ✓ no início.
        if (/credits:.*time:.*s/i.test(trimmed) || /^✓/.test(trimmed)) {
          setState('success');
          continue;
        }

        // Texto substancial enquanto pensando -> respondendo.
        if (currentDetectedState === 'thinking' && trimmed.length > 20) {
          setState('working');
        }
      }
    };

    const offStdout = window.mesp.onTerminalStdout(({ petId: pid, data }) => {
      if (pid !== petId) return;
      term.write(data);
      detectState(data);
    });
    const offStderr = window.mesp.onTerminalStderr(({ petId: pid, data }) => {
      if (pid !== petId) return;
      term.write(data);
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

    return () => {
      offStdout();
      offStderr();
      offExit();
      writeKeyRef.current = null;
      resizeRef.current = null;
      if (stateTimer) clearTimeout(stateTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [pet.id, commandInfo.cmd, commandInfo.args, configLoaded]);

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
    const cmdLine = `\x1b[90m$ ${commandInfo.cmd}${commandInfo.args.length ? ' ' + commandInfo.args.join(' ') : ''}\x1b[0m\r\n`;
    term.write(cmdLine);
    void window.mesp
      .terminalSpawn({
        petId: pet.id,
        command: commandInfo.cmd,
        args: commandInfo.args,
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
          setTimeout(() => term.focus(), 30);
        } else {
          term.write(`\r\n\x1b[31m✗ Falha ao reconectar: ${res.error || 'desconhecido'}\x1b[0m\r\n`);
          setStatus('disconnected');
        }
      });
  }, [pet.id, commandInfo]);

  const kill = useCallback(() => {
    if (!window.mesp?.terminalKill) return;
    void window.mesp.terminalKill(pet.id);
  }, [pet.id]);

  // Posição do painel (em state pra permitir drag pelo header).
  const [pos, setPos] = useState(() => computePosition());
  const dragStateRef = useRef<{ pointerId: number; offX: number; offY: number } | null>(null);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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
  }, [pos.x, pos.y]);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragStateRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const x = Math.max(0, Math.min(winW - PANEL_WIDTH, e.clientX - d.offX));
    const y = Math.max(0, Math.min(winH - 40, e.clientY - d.offY));
    setPos({ x, y });
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragStateRef.current;
    if (d && d.pointerId === e.pointerId) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { /* noop */ }
      dragStateRef.current = null;
    }
  }, []);

  return (
    <div
      className="kiro-terminal interactive"
      style={{
        left: pos.x,
        top: pos.y,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        display: visible ? undefined : 'none',
      }}
      role="dialog"
      aria-label={`Terminal MESP ${pet.id}`}
    >
      <div
        className="kiro-terminal-header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <div className="kiro-terminal-title">
          <span className={`terminal-dot status-${status}`} />
          Kiro CLI
          <span className="muted">— {pet.id}</span>
        </div>
        <span className={`terminal-status ${status}`}>
          {status === 'connected' ? '● conectado' : status === 'connecting' ? '◌ conectando…' : '○ desconectado'}
        </span>
        <button
          className="btn-icon"
          onClick={() => setShowConfig((v) => !v)}
          title="Configurar comando"
          aria-label="Configurar comando"
        >
          ⚙
        </button>
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
        <button className="btn-icon" onClick={onClose} title="Fechar (Esc)" aria-label="Fechar">
          ×
        </button>
      </div>

      {showConfig && (
        <div className="kiro-terminal-config">
          <label>
            <span>Comando</span>
            <input
              type="text"
              value={editCmd}
              onChange={(e) => setEditCmd(e.target.value)}
              placeholder="kiro-cli"
              spellCheck={false}
            />
          </label>
          <label>
            <span>Argumentos</span>
            <input
              type="text"
              value={editArgs}
              onChange={(e) => setEditArgs(e.target.value)}
              placeholder="chat"
              spellCheck={false}
            />
          </label>
          <div className="config-actions">
            <span className="config-preview">
              <code>
                {editCmd} {editArgs}
              </code>
            </span>
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
      )}

      <div
        ref={containerRef}
        className="kiro-terminal-xterm"
        onClick={() => termRef.current?.focus()}
      />
    </div>
  );
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
