// src/services/kiroBridge.ts
//
// Camada genérica para "rodar a Kiro" ou qualquer comando de terminal.
// Funciona em dois modos:
//   - Real:  via window.mesp.runKiro (precisa estar dentro do Electron).
//   - Mock:  simulação local que não depende da Kiro.
//
// Quem usa este serviço normalmente é o renderer/React. O orquestrador
// (PetManager) chama `runKiroCommand` para que o pet acompanhe o ciclo de vida
// da execução (working -> success/error) e gere o resumo automático.

import { summarize } from './summarize';
import type { TaskStatus } from '../types';

export interface RunOptions {
  /** Comando a executar; default = process.env.KIRO_COMMAND ou "kiro". */
  command?: string;
  /** Argumentos. */
  args?: string[];
  /** Diretório de trabalho. */
  cwd?: string;
  /** Forçar modo mock mesmo dentro do Electron. */
  mock?: boolean;
  /** Resposta a usar no modo mock; se ausente, é gerada. */
  mockResponse?: string;
  /** Status final no modo mock (default: success). */
  mockStatus?: 'success' | 'error';
  /** Tempo de simulação em modo mock (default 1500ms). */
  mockDelay?: number;
  /** Callback para chunks de stdout em tempo real. */
  onStdout?: (chunk: string) => void;
  /** Callback para chunks de stderr. */
  onStderr?: (chunk: string) => void;
  /** Callback de progresso de status. */
  onStatus?: (status: TaskStatus) => void;
}

export interface RunResult {
  ok: boolean;
  status: TaskStatus;
  stdout: string;
  stderr: string;
  summary: string;
  fullText: string;
  command: string;
  args: string[];
  startedAt: number;
  endedAt: number;
  error?: string;
}

let runCounter = 0;
function newRunId(): string {
  runCounter += 1;
  return `run-${Date.now()}-${runCounter}`;
}

/** Heurística: roda em mock quando não há API do Electron disponível. */
export function isMockOnly(): boolean {
  return typeof window === 'undefined' || !window.mesp;
}

/**
 * Executa um comando externo (Kiro CLI ou outro) e retorna o resultado consolidado.
 */
export async function runKiroCommand(options: RunOptions = {}): Promise<RunResult> {
  const startedAt = Date.now();
  const useMock = options.mock || isMockOnly();
  const command = options.command || 'kiro';
  const args = options.args || [];

  options.onStatus?.('thinking');
  // Pequeno delay para o pet "pensar".
  await delay(useMock ? 250 : 80);
  options.onStatus?.('working');

  if (useMock) {
    return runMock({ ...options, command, args, startedAt });
  }

  const runId = newRunId();
  const stop1 = window.mesp!.onKiroStdout(({ runId: rid, chunk }) => {
    if (rid === runId) options.onStdout?.(chunk);
  });
  const stop2 = window.mesp!.onKiroStderr(({ runId: rid, chunk }) => {
    if (rid === runId) options.onStderr?.(chunk);
  });

  try {
    const result = await window.mesp!.runKiro({
      runId,
      command,
      args,
      cwd: options.cwd,
    });
    const endedAt = Date.now();
    const fullText = result.stdout || result.stderr || result.error || '(sem saída)';
    const summary = summarize(fullText);
    const status: TaskStatus = result.ok ? 'success' : 'error';
    options.onStatus?.(status);
    return {
      ok: result.ok,
      status,
      stdout: result.stdout,
      stderr: result.stderr,
      summary,
      fullText,
      command: result.command,
      args: result.args,
      startedAt,
      endedAt,
      error: result.error,
    };
  } catch (err) {
    const endedAt = Date.now();
    const message = err instanceof Error ? err.message : String(err);
    options.onStatus?.('error');
    return {
      ok: false,
      status: 'error',
      stdout: '',
      stderr: message,
      summary: summarize(message),
      fullText: message,
      command,
      args,
      startedAt,
      endedAt,
      error: message,
    };
  } finally {
    stop1();
    stop2();
  }
}

interface MockOpts extends RunOptions {
  command: string;
  args: string[];
  startedAt: number;
}

async function runMock(opts: MockOpts): Promise<RunResult> {
  const ms = opts.mockDelay ?? 1500;
  await delay(ms);
  const status: TaskStatus = opts.mockStatus ?? 'success';
  const fullText =
    opts.mockResponse ||
    defaultMockResponse(opts.command, opts.args, status === 'error');
  const summary = summarize(fullText);
  opts.onStdout?.(fullText);
  opts.onStatus?.(status);
  return {
    ok: status === 'success',
    status,
    stdout: status === 'success' ? fullText : '',
    stderr: status === 'error' ? fullText : '',
    summary,
    fullText,
    command: opts.command,
    args: opts.args,
    startedAt: opts.startedAt,
    endedAt: Date.now(),
  };
}

function defaultMockResponse(command: string, args: string[], isError: boolean): string {
  if (isError) {
    return `Erro simulado ao executar "${command} ${args.join(' ')}".\nVerifique se o comando existe ou rode em modo mock para teste.`;
  }
  return [
    `Resposta simulada da Kiro para o comando "${command} ${args.join(' ')}".`,
    '',
    'Tudo certo! Esta é uma resposta de exemplo gerada em modo mock para você testar o pet sem precisar da Kiro CLI instalada.',
    '',
    '- Item 1: o pet está acompanhando o ciclo working -> success.',
    '- Item 2: o resumo automático foi gerado a partir das primeiras frases.',
    '- Item 3: clique no balão para ver esta mensagem completa no painel.',
  ].join('\n');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
