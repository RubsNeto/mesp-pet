// electron/preload.ts
//
// Exposição segura de uma API mínima para o renderer.
// O renderer NUNCA tem acesso direto a Node, apenas a estes métodos.

import { contextBridge, ipcRenderer } from 'electron';

export interface KiroRunOptions {
  runId: string;
  command?: string;
  args?: string[];
  cwd?: string;
}

export interface KiroRunResult {
  runId: string;
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  command: string;
  args: string[];
  error?: string;
}

const api = {
  /** Executa um comando externo (Kiro CLI ou outro). */
  runKiro(opts: KiroRunOptions): Promise<KiroRunResult> {
    return ipcRenderer.invoke('kiro:run', opts);
  },
  /** Cancela uma execução em andamento. */
  cancelKiro(runId: string): Promise<boolean> {
    return ipcRenderer.invoke('kiro:cancel', runId);
  },
  /** Stream de stdout durante a execução. */
  onKiroStdout(cb: (data: { runId: string; chunk: string }) => void): () => void {
    const handler = (_e: unknown, data: { runId: string; chunk: string }) => cb(data);
    ipcRenderer.on('kiro:stdout', handler);
    return () => ipcRenderer.removeListener('kiro:stdout', handler);
  },
  /** Stream de stderr durante a execução. */
  onKiroStderr(cb: (data: { runId: string; chunk: string }) => void): () => void {
    const handler = (_e: unknown, data: { runId: string; chunk: string }) => cb(data);
    ipcRenderer.on('kiro:stderr', handler);
    return () => ipcRenderer.removeListener('kiro:stderr', handler);
  },
  /** Faz a janela ignorar (true) ou capturar (false) cliques. */
  setIgnoreMouseEvents(ignore: boolean, forward = true): Promise<void> {
    return ipcRenderer.invoke('app:set-ignore-mouse-events', ignore, forward);
  },
  /** Encerra o aplicativo. */
  quit(): Promise<void> {
    return ipcRenderer.invoke('app:quit');
  },
  /** Abre o devtools (debug). */
  openDevTools(): Promise<void> {
    return ipcRenderer.invoke('app:open-devtools');
  },
  /** Retorna a configuração atual (vinda do .env do main). */
  getConfig(): Promise<{
    kiroCommand: string;
    kiroTaskPrefix: string;
    kiroDefaultArgs: string;
  }> {
    return ipcRenderer.invoke('app:get-config');
  },

  /** Verifica se o app está configurado para iniciar com o sistema. */
  getAutoStart(): Promise<boolean> {
    return ipcRenderer.invoke('app:get-auto-start');
  },
  /** Habilita/desabilita auto-start no login do sistema. */
  setAutoStart(enabled: boolean): Promise<boolean> {
    return ipcRenderer.invoke('app:set-auto-start', enabled);
  },
  /** Verifica se um comando está instalado na PATH. */
  checkCommand(command: string): Promise<boolean> {
    return ipcRenderer.invoke('app:check-command', command);
  },
  /** Abre o diálogo nativo de seleção de pasta. Retorna o caminho ou null. */
  selectFolder(defaultPath?: string): Promise<string | null> {
    return ipcRenderer.invoke('dialog:select-folder', defaultPath);
  },

  // ----- Terminal persistente ------------------------------------------------

  /** Spawna um processo persistente da Kiro CLI para um pet. */
  terminalSpawn(opts: {
    petId: string;
    command?: string;
    args?: string[];
    cwd?: string;
    cols?: number;
    rows?: number;
  }): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('terminal:spawn', opts);
  },
  /** Envia dados (stdin) ao processo do terminal. */
  terminalWrite(petId: string, data: string): Promise<boolean> {
    return ipcRenderer.invoke('terminal:write', { petId, data });
  },
  /** Redimensiona o PTY (informa novas cols/rows ao processo). */
  terminalResize(petId: string, cols: number, rows: number): Promise<boolean> {
    return ipcRenderer.invoke('terminal:resize', { petId, cols, rows });
  },
  /** Mata o processo do terminal. */
  terminalKill(petId: string): Promise<boolean> {
    return ipcRenderer.invoke('terminal:kill', petId);
  },
  /** Listener de stdout do terminal. */
  onTerminalStdout(cb: (data: { petId: string; data: string }) => void): () => void {
    const handler = (_e: unknown, data: { petId: string; data: string }) => cb(data);
    ipcRenderer.on('terminal:stdout', handler);
    return () => ipcRenderer.removeListener('terminal:stdout', handler);
  },
  /** Listener de stderr do terminal. */
  onTerminalStderr(cb: (data: { petId: string; data: string }) => void): () => void {
    const handler = (_e: unknown, data: { petId: string; data: string }) => cb(data);
    ipcRenderer.on('terminal:stderr', handler);
    return () => ipcRenderer.removeListener('terminal:stderr', handler);
  },
  /** Listener de exit do terminal. */
  onTerminalExit(cb: (data: { petId: string; code: number | null; error?: string }) => void): () => void {
    const handler = (_e: unknown, data: { petId: string; code: number | null; error?: string }) => cb(data);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  /** Indica que estamos rodando dentro do Electron. */
  isElectron: true as const,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('mesp', api);

export type MespApi = typeof api;
