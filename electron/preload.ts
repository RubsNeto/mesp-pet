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

export interface MespCodeEvent {
  petId: string;
  requestId: string;
  kind: 'started' | 'event' | 'text' | 'permission' | 'exit';
  mode?: 'fast' | 'plan' | 'assisted' | 'autonomous';
  engine?: '9router' | 'opencode' | 'opencode-server';
  event?: Record<string, unknown>;
  text?: string;
  code?: number | null;
  error?: string;
  cancelled?: boolean;
  sessionInvalid?: boolean;
  durationMs?: number;
  firstTokenMs?: number;
  sessionId?: string | null;
  permission?: {
    id: string;
    action: string;
    resources: string[];
    remember: string[];
    tool?: string;
  };
}

export interface MespCodeDiffFile {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status: string;
}

export type ProjectCheckName = 'typecheck' | 'lint' | 'test' | 'build' | 'check';

export interface MespCodeVerifyEvent {
  petId: string;
  verificationId: string;
  messageId: string;
  kind: 'started' | 'check-started' | 'check-output' | 'check-exit' | 'exit';
  checks?: ProjectCheckName[];
  check?: ProjectCheckName;
  stream?: 'stdout' | 'stderr';
  text?: string;
  code?: number | null;
  durationMs?: number;
  timedOut?: boolean;
  truncated?: boolean;
  passed?: boolean;
  cancelled?: boolean;
  results?: Array<{
    check: ProjectCheckName;
    code: number | null;
    durationMs: number;
    timedOut: boolean;
    truncated: boolean;
  }>;
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
  /** Metadados seguros do OpenCode/9Router (nunca inclui a API key). */
  getOpenCodeStatus(force?: boolean): Promise<{
    model: string | null;
    modelCount: number;
    providerPrefixes: string[];
    models: string[];
    routerState: 'unknown' | 'ready' | 'unauthorized' | 'unreachable' | 'misconfigured';
    routerMessage: string;
    routerCheckedAt: number | null;
    runtime: {
      opencode: 'bundled' | 'system' | 'custom' | 'missing';
      node: 'bundled' | 'system' | 'custom' | 'missing';
      npm: 'bundled' | 'system' | 'custom' | 'missing';
      router: 'bundled' | 'external' | 'starting' | 'unavailable';
      routerBundledAvailable: boolean;
      portableReady: boolean;
      setupRequired: boolean;
    };
  }> {
    return ipcRenderer.invoke('opencode:get-status', force === true);
  },
  /** Abre o painel local do 9Router em uma janela isolada do Electron. */
  open9RouterDashboard(): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('opencode:open-router-dashboard');
  },
  /** Envia uma mensagem pelo motor headless do OpenCode. */
  sendMespCode(opts: {
    petId: string;
    requestId: string;
    prompt: string;
    model: string;
    mode: 'fast' | 'plan' | 'assisted' | 'autonomous';
    sessionId?: string | null;
    cwd?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    limits?: { maxDurationMs: number; maxTokens: number; maxToolCalls: number };
  }): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('mesp-code:send', opts);
  },
  /** Interrompe a resposta atual do MESP Code. */
  cancelMespCode(petId: string, requestId: string): Promise<boolean> {
    return ipcRenderer.invoke('mesp-code:cancel', { petId, requestId });
  },
  /** Responde a uma autorizacao pendente do modo Assistido. */
  replyMespCodePermission(opts: {
    petId: string;
    requestId: string;
    permissionId: string;
    reply: 'once' | 'always' | 'reject';
  }): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('mesp-code:permission-reply', opts);
  },
  /** Retorna as mudancas de uma sessao, com conteudo sensivel filtrado no main. */
  getMespCodeDiff(opts: {
    sessionId: string;
    messageId?: string;
    cwd: string;
  }): Promise<{ ok: boolean; files?: MespCodeDiffFile[]; truncated?: boolean; error?: string }> {
    return ipcRenderer.invoke('mesp-code:get-diff', opts);
  },
  /** Reverte as mudancas a partir de uma mensagem, apos confirmacao no renderer. */
  revertMespCode(opts: {
    sessionId: string;
    messageId: string;
    cwd: string;
  }): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('mesp-code:revert', opts);
  },
  /** Stream estruturado do OpenCode em formato JSON. */
  onMespCodeEvent(cb: (data: MespCodeEvent) => void): () => void {
    const handler = (_e: unknown, data: MespCodeEvent) => cb(data);
    ipcRenderer.on('mesp-code:event', handler);
    return () => ipcRenderer.removeListener('mesp-code:event', handler);
  },
  /** Descobre scripts de verificacao conhecidos no package.json do projeto. */
  getProjectChecks(cwd: string): Promise<{
    ok: boolean;
    checks: ProjectCheckName[];
    error?: string;
  }> {
    return ipcRenderer.invoke('mesp-code:get-project-checks', cwd);
  },
  /** Executa scripts conhecidos, em serie e com limites no processo principal. */
  verifyMespCode(opts: {
    petId: string;
    verificationId: string;
    messageId: string;
    cwd: string;
    checks: ProjectCheckName[];
  }): Promise<{
    ok: boolean;
    passed?: boolean;
    cancelled?: boolean;
    error?: string;
    results?: Array<{
      check: ProjectCheckName;
      code: number | null;
      durationMs: number;
      timedOut: boolean;
      truncated: boolean;
    }>;
  }> {
    return ipcRenderer.invoke('mesp-code:verify', opts);
  },
  /** Interrompe a verificacao de projeto em andamento. */
  cancelMespCodeVerification(petId: string, verificationId: string): Promise<boolean> {
    return ipcRenderer.invoke('mesp-code:verify-cancel', { petId, verificationId });
  },
  /** Eventos de progresso dos quality gates. */
  onMespCodeVerifyEvent(cb: (data: MespCodeVerifyEvent) => void): () => void {
    const handler = (_e: unknown, data: MespCodeVerifyEvent) => cb(data);
    ipcRenderer.on('mesp-code:verify-event', handler);
    return () => ipcRenderer.removeListener('mesp-code:verify-event', handler);
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

  // ----- Notificações & always-on --------------------------------------------

  /** Mostra uma notificação do SO. Por padrão só dispara se a janela não
   *  estiver em foco. Retorna true se a notificação foi exibida. */
  notify(opts: { title: string; body?: string; force?: boolean }): Promise<boolean> {
    return ipcRenderer.invoke('app:notify', opts);
  },
  /** Lê o estado atual do modo foco (silêncio). */
  getFocusMode(): Promise<boolean> {
    return ipcRenderer.invoke('app:get-focus-mode');
  },
  /** Liga/desliga o modo foco. */
  setFocusMode(enabled: boolean): Promise<boolean> {
    return ipcRenderer.invoke('app:set-focus-mode', enabled);
  },
  /** Notifica mudanças no modo foco (disparadas pelo tray/atalho global). */
  onFocusMode(cb: (enabled: boolean) => void): () => void {
    const handler = (_e: unknown, enabled: boolean) => cb(enabled);
    ipcRenderer.on('app:focus-mode', handler);
    return () => ipcRenderer.removeListener('app:focus-mode', handler);
  },
  /** Mostra/esconde a janela dos pets. */
  toggleVisibility(): Promise<boolean> {
    return ipcRenderer.invoke('app:toggle-visibility');
  },
  /** Abre o diálogo nativo de seleção de pasta. Retorna o caminho ou null. */
  selectFolder(defaultPath?: string): Promise<string | null> {
    return ipcRenderer.invoke('dialog:select-folder', defaultPath);
  },

  // ----- Clipboard -----------------------------------------------------------

  /** Lê o texto atual do clipboard do sistema. */
  clipboardReadText(): Promise<string> {
    return ipcRenderer.invoke('clipboard:read-text');
  },
  /** Escreve texto no clipboard do sistema. */
  clipboardWriteText(text: string): Promise<boolean> {
    return ipcRenderer.invoke('clipboard:write-text', text);
  },
  /** Se houver imagem no clipboard, salva como PNG temporário e retorna o caminho. */
  clipboardSaveImage(): Promise<string | null> {
    return ipcRenderer.invoke('clipboard:save-image');
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
  onTerminalExit(
    cb: (data: { petId: string; code: number | null; error?: string }) => void,
  ): () => void {
    const handler = (_e: unknown, data: { petId: string; code: number | null; error?: string }) =>
      cb(data);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  /** Indica que estamos rodando dentro do Electron. */
  // ----- Contexto de projeto & export ----------------------------------------

  /** Le os arquivos de regras (AGENTS.md/CLAUDE.md/...) da pasta do projeto. */
  readProjectRules(workDir: string): Promise<Array<{ name: string; content: string }>> {
    return ipcRenderer.invoke('project:read-rules', workDir);
  },
  /** Grava um arquivo de regras do projeto. */
  writeProjectRules(opts: { workDir: string; name: string; content: string }): Promise<boolean> {
    return ipcRenderer.invoke('project:write-rules', opts);
  },
  /** Status git best-effort da pasta do projeto (ou null se nao for repo/git ausente). */
  gitStatus(workDir: string): Promise<{ branch: string; changed: number; files: string[] } | null> {
    return ipcRenderer.invoke('project:git-status', workDir);
  },
  /** Salva um texto em arquivo via dialogo nativo (export de transcript/notas). */
  saveTextFile(opts: { content: string; defaultName?: string }): Promise<boolean> {
    return ipcRenderer.invoke('app:save-text-file', opts);
  },
  /** git diff --stat da pasta do projeto (ou null). */
  gitDiff(workDir: string): Promise<string | null> {
    return ipcRenderer.invoke('project:git-diff', workDir);
  },
  /** HEAD curto (hash do ultimo commit) da pasta do projeto (ou null). */
  gitHead(workDir: string): Promise<string | null> {
    return ipcRenderer.invoke('project:git-head', workDir);
  },
  /** Abre uma URL http(s) no navegador padrao. */
  openExternal(url: string): Promise<boolean> {
    return ipcRenderer.invoke('app:open-external', url);
  },
  isElectron: true as const,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('mesp', api);

export type MespApi = typeof api;
