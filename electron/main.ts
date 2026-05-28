// electron/main.ts
//
// Processo principal do Electron.
// Cria uma janela transparente, sem moldura, sempre no topo, ocupando toda a tela.
// Como o renderer (React) é responsável por desenhar os pets em divs absolutas, a
// janela faz o papel de "camada flutuante" sobre o desktop.
//
// IPC (todos os handlers validam input em runtime; a tipagem do preload é só
// uma promessa, não garantia):
//   - kiro:run        -> executa um comando externo (ex.: kiro CLI) e devolve o resultado
//   - kiro:cancel     -> cancela uma execução em andamento
//   - app:quit        -> encerra a aplicação
//   - app:set-ignore-mouse-events -> deixa cliques passarem pela janela em áreas vazias
//
// Endurecimento para produção:
//   - Validação de tipos em runtime nos inputs do IPC.
//   - Rate-limit do número de PTYs simultâneos.
//   - Cap do número de runs concorrentes.
//   - safeSend ignora `webContents.send` quando a janela já foi destruída.

import { app, BrowserWindow, ipcMain, screen, Menu } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';

// Em produção a janela carrega dist/index.html.
// Em dev, vite-plugin-electron injeta VITE_DEV_SERVER_URL.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// Limites de produção.
const MAX_TERMINAL_PROCESSES = 16;
const MAX_RUNNING_PROCESSES = 32;
const MAX_ARG_COUNT = 64;
const MAX_ARG_LENGTH = 4096;
const MAX_PETID_LENGTH = 64;
const MAX_RUNID_LENGTH = 128;
const MAX_TERMINAL_DATA_BYTES = 1_000_000; // 1MB write em terminal:write
const COMMAND_PATTERN = /^[A-Za-z0-9_./\\:\-+ ]{1,512}$/;
const PETID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RUNID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

// Carrega .env de forma simples, sem dependência externa.
function loadDotEnv(): void {
  const envPath = path.join(app.getAppPath(), '.env');
  if (!fs.existsSync(envPath)) return;
  let content: string;
  try {
    content = fs.readFileSync(envPath, 'utf-8');
  } catch {
    return;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    // Aceita só chaves "ENV_LIKE" para não permitir poluição do process.env.
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    const value = line.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

let mainWindow: BrowserWindow | null = null;

// Map de processos em andamento, por runId, para suportar cancelamento.
const runningProcesses = new Map<string, ChildProcessWithoutNullStreams>();

// Processos persistentes de terminal (um por pet) — PTY real (node-pty).
const terminalProcesses = new Map<string, pty.IPty>();

// ---------------------------------------------------------------------------
//  Validação de input (runtime, defesa em profundidade)
// ---------------------------------------------------------------------------

function isString(v: unknown, max = Infinity): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function isStringArray(v: unknown, maxItems: number, maxLen: number): v is string[] {
  if (!Array.isArray(v)) return false;
  if (v.length > maxItems) return false;
  for (const item of v) {
    if (typeof item !== 'string') return false;
    if (item.length > maxLen) return false;
  }
  return true;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validatePetId(id: unknown): string | null {
  if (!isString(id, MAX_PETID_LENGTH)) return null;
  if (!PETID_PATTERN.test(id)) return null;
  return id;
}

function validateRunId(id: unknown): string | null {
  if (!isString(id, MAX_RUNID_LENGTH)) return null;
  if (!RUNID_PATTERN.test(id)) return null;
  return id;
}

function validateCommand(cmd: unknown): string | null {
  if (!isString(cmd, 512)) return null;
  if (!COMMAND_PATTERN.test(cmd)) return null;
  return cmd;
}

// Sanitiza argumentos para evitar injeção de comandos (defesa adicional ao
// validateCommand).
export function sanitizeArg(arg: string): string {
  // Remove caracteres perigosos de shell: ; | & ` $ ( ) { } < > \n \r e nul.
  // Também NUL bytes que podem truncar strings em algumas chamadas.
  return arg.replace(/[;|&`$(){}[\]<>\n\r\0]/g, '');
}

function sanitizeArgs(args: string[]): string[] {
  return args.map(sanitizeArg).filter((a) => a.length > 0);
}

/** Envia mensagem para o renderer com proteção contra janela destruída. */
function safeSend(channel: string, payload: unknown): void {
  if (!mainWindow) return;
  if (mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) return;
  try {
    wc.send(channel, payload);
  } catch {
    // Janela pode ter sido destruída entre o check e o send — ignora.
  }
}

// ---------------------------------------------------------------------------
//  Window / app lifecycle
// ---------------------------------------------------------------------------

function createWindow(): void {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Endurecimento extra:
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  // Sempre no topo mesmo sobre janelas em modo fullscreen.
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Por padrão a janela ignora cliques. O renderer ativa "captura" sobre os
  // elementos interativos (pet, balão, painel) via app:set-ignore-mouse-events.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Bloqueia navegação pra fora — proteção contra hijack do renderer.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e, url) => {
    // Permite só o dev server e o file:// local.
    if (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) return;
    if (url.startsWith('file://')) return;
    e.preventDefault();
  });

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
//  IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('app:set-ignore-mouse-events', (_evt, ignoreRaw: unknown, forwardRaw: unknown = true) => {
  const ignore = ignoreRaw === true;
  const forward = forwardRaw !== false;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setIgnoreMouseEvents(ignore, ignore ? { forward } : undefined);
});

ipcMain.handle('app:quit', () => {
  app.quit();
});

ipcMain.handle('app:open-devtools', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.openDevTools({ mode: 'detach' });
});

ipcMain.handle('app:get-config', () => ({
  kiroCommand: process.env.KIRO_COMMAND || 'kiro-cli',
  kiroTaskPrefix: process.env.KIRO_TASK_PREFIX || 'chat',
  kiroDefaultArgs: process.env.KIRO_DEFAULT_ARGS || '',
}));

// Verifica se um comando está disponível na PATH do sistema.
ipcMain.handle('app:check-command', async (_evt, commandRaw: unknown): Promise<boolean> => {
  const command = validateCommand(commandRaw);
  if (!command) return false;
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const child = spawn(finder, [command], {
      shell: false,
      env: { ...process.env },
    });
    let resolved = false;
    const finalize = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(ok);
    };
    child.on('error', () => finalize(false));
    child.on('close', (code) => finalize(code === 0));
    setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      finalize(false);
    }, 2000);
  });
});

// ----- Auto-start (login items) ---------------------------------------------

ipcMain.handle('app:get-auto-start', () => {
  const settings = app.getLoginItemSettings();
  return settings.openAtLogin;
});

ipcMain.handle('app:set-auto-start', (_evt, enabledRaw: unknown) => {
  const enabled = enabledRaw === true;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
    args: [],
  });
  return app.getLoginItemSettings().openAtLogin;
});

// ----- Comando externo "one-shot" -------------------------------------------

ipcMain.handle(
  'kiro:run',
  async (event, payloadRaw: unknown) => {
    if (!payloadRaw || typeof payloadRaw !== 'object') {
      return makeRunError('payload inválido');
    }
    const payload = payloadRaw as Record<string, unknown>;
    const runId = validateRunId(payload.runId);
    if (!runId) return makeRunError('runId inválido');

    if (runningProcesses.size >= MAX_RUNNING_PROCESSES) {
      return makeRunError(`limite de ${MAX_RUNNING_PROCESSES} processos concorrentes atingido`, runId);
    }
    if (runningProcesses.has(runId)) {
      return makeRunError('runId em uso', runId);
    }

    const cmdRaw = payload.command;
    const cmd = validateCommand(cmdRaw)
      ?? validateCommand(process.env.KIRO_COMMAND ?? null)
      ?? 'kiro';

    const argsInput = payload.args;
    let args: string[];
    if (argsInput === undefined || argsInput === null) {
      args = (process.env.KIRO_DEFAULT_ARGS || '').split(' ').filter(Boolean);
    } else if (isStringArray(argsInput, MAX_ARG_COUNT, MAX_ARG_LENGTH)) {
      args = argsInput;
    } else {
      return makeRunError('args inválidos', runId);
    }
    const finalArgs = sanitizeArgs(args);

    const cwd = isString(payload.cwd, 4096) ? payload.cwd : process.cwd();

    return await new Promise<KiroRunResult>((resolve) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(cmd, finalArgs, {
          cwd,
          shell: process.platform === 'win32',
          env: { ...process.env },
        });
      } catch (err) {
        resolve({
          runId,
          ok: false,
          code: null,
          stdout: '',
          stderr: '',
          command: cmd,
          args: finalArgs,
          error: (err as Error).message,
        });
        return;
      }

      runningProcesses.set(runId, child);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('kiro:stdout', { runId, chunk: text });
        }
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('kiro:stderr', { runId, chunk: text });
        }
      });

      child.on('error', (err) => {
        runningProcesses.delete(runId);
        resolve({
          runId,
          ok: false,
          code: null,
          stdout,
          stderr,
          command: cmd,
          args: finalArgs,
          error: err.message,
        });
      });

      child.on('close', (code) => {
        runningProcesses.delete(runId);
        resolve({
          runId,
          ok: code === 0,
          code,
          stdout,
          stderr,
          command: cmd,
          args: finalArgs,
        });
      });
    });
  }
);

interface KiroRunResult {
  runId: string;
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  command: string;
  args: string[];
  error?: string;
}

function makeRunError(error: string, runId = 'invalid'): KiroRunResult {
  return {
    runId,
    ok: false,
    code: null,
    stdout: '',
    stderr: '',
    command: '',
    args: [],
    error,
  };
}

ipcMain.handle('kiro:cancel', (_evt, runIdRaw: unknown) => {
  const runId = validateRunId(runIdRaw);
  if (!runId) return false;
  const child = runningProcesses.get(runId);
  if (child) {
    try {
      child.kill();
    } catch {
      /* noop */
    }
    runningProcesses.delete(runId);
    return true;
  }
  return false;
});

// ----- Terminal persistente (PTY real, um por pet) ---------------------------

ipcMain.handle('terminal:spawn', (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') {
    return { ok: false, error: 'payload inválido' };
  }
  const payload = payloadRaw as Record<string, unknown>;
  const petId = validatePetId(payload.petId);
  if (!petId) return { ok: false, error: 'petId inválido' };

  // Mata processo anterior se existir (sempre — mesmo lógica de antes).
  const existing = terminalProcesses.get(petId);
  if (existing) {
    try { existing.kill(); } catch { /* noop */ }
    terminalProcesses.delete(petId);
  }

  // Cap global de PTYs simultâneos.
  if (terminalProcesses.size >= MAX_TERMINAL_PROCESSES) {
    return { ok: false, error: `limite de ${MAX_TERMINAL_PROCESSES} terminais atingido` };
  }

  const cmd = validateCommand(payload.command)
    ?? validateCommand(process.env.KIRO_COMMAND ?? null)
    ?? 'kiro-cli';

  const argsInput = payload.args;
  let args: string[];
  if (argsInput === undefined || argsInput === null) {
    args = (process.env.KIRO_TASK_PREFIX || 'chat').split(' ').filter(Boolean);
  } else if (isStringArray(argsInput, MAX_ARG_COUNT, MAX_ARG_LENGTH)) {
    args = argsInput;
  } else {
    return { ok: false, error: 'args inválidos' };
  }
  const finalArgs = sanitizeArgs(args);

  const cols = isFiniteNumber(payload.cols)
    ? Math.max(1, Math.min(1000, Math.floor(payload.cols)))
    : 100;
  const rows = isFiniteNumber(payload.rows)
    ? Math.max(1, Math.min(500, Math.floor(payload.rows)))
    : 30;
  const cwd = isString(payload.cwd, 4096) ? payload.cwd : process.cwd();

  // No Windows, pty.spawn chama CreateProcess direto e NÃO respeita PATHEXT.
  // Isso significa que `kiro-cli.cmd`, `npm.cmd`, etc. falham com "file not
  // found". Para suportar .cmd/.bat/.ps1, wrappamos com `cmd.exe /c`, que
  // resolve o nome via PATH + PATHEXT corretamente.
  let spawnCmd = cmd;
  let spawnArgs = finalArgs;
  if (process.platform === 'win32' && !/\.exe$/i.test(cmd)) {
    spawnCmd = process.env.ComSpec || 'cmd.exe';
    spawnArgs = ['/c', cmd, ...finalArgs];
  }

  let ptyProcess: pty.IPty;
  try {
    ptyProcess = pty.spawn(spawnCmd, spawnArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' } as { [key: string]: string },
    });
  } catch (err) {
    safeSend('terminal:exit', {
      petId,
      code: null,
      error: (err as Error).message,
    });
    return { ok: false, error: (err as Error).message };
  }

  terminalProcesses.set(petId, ptyProcess);

  ptyProcess.onData((data) => {
    safeSend('terminal:stdout', { petId, data });
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    terminalProcesses.delete(petId);
    safeSend('terminal:exit', {
      petId,
      code: exitCode,
      error: signal ? `signal ${signal}` : undefined,
    });
  });

  return { ok: true };
});

ipcMain.handle('terminal:write', (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') return false;
  const payload = payloadRaw as Record<string, unknown>;
  const petId = validatePetId(payload.petId);
  if (!petId) return false;
  if (typeof payload.data !== 'string') return false;
  if (payload.data.length > MAX_TERMINAL_DATA_BYTES) return false;
  const ptyProcess = terminalProcesses.get(petId);
  if (!ptyProcess) return false;
  ptyProcess.write(payload.data);
  return true;
});

ipcMain.handle('terminal:resize', (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') return false;
  const payload = payloadRaw as Record<string, unknown>;
  const petId = validatePetId(payload.petId);
  if (!petId) return false;
  if (!isFiniteNumber(payload.cols) || !isFiniteNumber(payload.rows)) return false;
  const cols = Math.max(1, Math.min(1000, Math.floor(payload.cols)));
  const rows = Math.max(1, Math.min(500, Math.floor(payload.rows)));
  const ptyProcess = terminalProcesses.get(petId);
  if (!ptyProcess) return false;
  try {
    ptyProcess.resize(cols, rows);
  } catch {
    /* noop */
  }
  return true;
});

ipcMain.handle('terminal:kill', (_evt, petIdRaw: unknown) => {
  const petId = validatePetId(petIdRaw);
  if (!petId) return false;
  const ptyProcess = terminalProcesses.get(petId);
  if (!ptyProcess) return false;
  try { ptyProcess.kill(); } catch { /* noop */ }
  terminalProcesses.delete(petId);
  return true;
});

// Sem menu nativo; o pet tem seu próprio menu via context menu HTML.
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  loadDotEnv();
  // Ativa auto-start com o Windows por padrão
  if (!app.getLoginItemSettings().openAtLogin) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Em Windows/Linux fecha o app quando a janela é fechada.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup: mata todos os PTYs e processos antes de sair, evitando órfãos.
app.on('before-quit', () => {
  for (const child of runningProcesses.values()) {
    try { child.kill(); } catch { /* noop */ }
  }
  runningProcesses.clear();
  for (const ptyProcess of terminalProcesses.values()) {
    try { ptyProcess.kill(); } catch { /* noop */ }
  }
  terminalProcesses.clear();
});
