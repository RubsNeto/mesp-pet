// src/types.ts
// Tipos compartilhados pelos componentes/hooks/serviços do MESP.

import type { MespTraits } from './procedural/traits';

export type PetState =
  | 'idle'
  | 'walking'
  | 'thinking'
  | 'working'
  | 'success'
  | 'error'
  | 'sleeping'
  | 'sitting';

/** Direções disponíveis para o sprite (esquerda ou direita; o lado direito é espelhado). */
export type PetFacing = 'left' | 'right';

/** Status de uma execução/tarefa que o pet está acompanhando. */
export type TaskStatus = 'thinking' | 'working' | 'success' | 'error' | 'idle';

export interface PetTask {
  id: string;
  title: string;
  /** Resumo curto, exibido no balão. */
  summary: string;
  /** Texto completo, exibido no painel. */
  fullText: string;
  status: TaskStatus;
  /** Timestamp de criação (ms). */
  createdAt: number;
  /** Mensagem opcional de erro. */
  error?: string;
}

export interface PetPosition {
  x: number;
  y: number;
}

export interface PetEntity {
  id: string;
  position: PetPosition;
  facing: PetFacing;
  state: PetState;
  /** Traits visuais únicos deste pet (cores, acessórios, manchas). */
  traits: MespTraits;
  /** Última tarefa associada (ou null). Sempre igual a history[history.length-1]. */
  task: PetTask | null;
  /** Histórico completo de tarefas executadas para este pet. */
  history: PetTask[];
  /** Mostrar balão? Pode estar ativo mesmo sem tarefa (ex.: dica). */
  showBubble: boolean;
  /** Pet está dormindo manualmente (não acordar pelo timer)? */
  manualSleep: boolean;
  /** Última vez que houve atividade (para timer de auto-dormir). */
  lastActivityAt: number;
}
