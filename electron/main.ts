// electron/main.ts
//
// Processo principal do Electron.
// Cria uma janela transparente, sem moldura, sempre no topo, ocupando toda a tela.
// Como o renderer (React) é responsável por desenhar os pets em divs absolutas, a
// janela faz o papel de "camada flutuante" sobre o desktop.
//
// IPC:
//   - kiro:run        -> executa um comando externo (ex.: kiro CLI) e devolve o resultado
//   - kiro:cancel     -> cancela uma execução em andamento
//   - app:quit        -> encerra a aplicação
//   - app:set-ignore-mouse-events -> deixa cliques passarem pela janela em áreas vazias

import { app, BrowserWindow, ipcMain, screen, Menu } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';

// Em produção a janela carrega dist/index.html.
// Em dev, vite-plugin-electron injeta VITE_DEV_SERVER_URL.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// Carrega .env de forma simples, sem dependência externa.
function loadDotEnv(): void {
  const envPath = path.join(app.getAppPath(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
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

// Sanitiza argumentos para evitar injeção de comandos.
function sanitizeArg(arg: string): string {
  // Remove caracteres perigosos de shell: ; | & ` $ ( ) { } < > \n \r
  return arg.replace(/[;|&`$(){}[\]<>\n\r]/g, '');
}

function sanitizeArgs(args: string[]): string[] {
  return args.map(sanitizeArg).filter(Boolean);
}

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
    },
  });

  // Sempre no topo mesmo sobre janelas em modo fullscreen.
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Por padrão a janela ignora cliques. O renderer ativa "captura" sobre os
  // elementos interativos (pet, balão, painel) via app:set-ignore-mouse-events.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
    // Devtools desligado por padrão para não roubar o foco do pet.
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
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

// IPC: ativar/desativar pass-through de cliques.
ipcMain.handle('app:set-ignore-mouse-events', (_evt, ignore: boolean, forward = true) => {
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(ignore, ignore ? { forward } : undefined);
});

ipcMain.handle('app:quit', () => {
  app.quit();
});

ipcMain.handle('app:open-devtools', () => {
  mainWindow?.webContents.openDevTools({ mode: 'detach' });
});

ipcMain.handle('app:get-config', () => ({
  kiroCommand: process.env.KIRO_COMMAND || 'kiro-cli',
  kiroTaskPrefix: process.env.KIRO_TASK_PREFIX || 'chat',
  kiroDefaultArgs: process.env.KIRO_DEFAULT_ARGS || '',
}));

// Verifica se um comando está disponível na PATH do sistema.
ipcMain.handle('app:check-command', async (_evt, command: string): Promise<boolean> => {
  if (!command || /[;|&`$(){}<>\n\r]/.test(command)) return false;
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
    // Timeout de 2s
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

ipcMain.handle('app:set-auto-start', (_evt, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // No Windows, abre minimizado para não "atrapalhar" o usuário.
    // No Mac/Linux openAsHidden é ignorado se não suportado.
    openAsHidden: false,
    args: [],
  });
  return app.getLoginItemSettings().openAtLogin;
});

// IPC: Kiro/processo externo.
ipcMain.handle(
  'kiro:run',
  async (
    event,
    payload: { runId: string; command?: string; args?: string[]; cwd?: string }
  ) => {
    const { runId, command, args, cwd } = payload;
    const cmd = command || process.env.KIRO_COMMAND || 'kiro';
    const finalArgs = sanitizeArgs(
      args && args.length > 0
        ? args
        : (process.env.KIRO_DEFAULT_ARGS || '').split(' ').filter(Boolean)
    );

    return await new Promise<{
      runId: string;
      ok: boolean;
      code: number | null;
      stdout: string;
      stderr: string;
      command: string;
      args: string[];
      error?: string;
    }>((resolve) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(cmd, finalArgs, {
          cwd: cwd || process.cwd(),
          shell: process.platform === 'win32', // necessário para resolver .cmd no Windows
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
        event.sender.send('kiro:stdout', { runId, chunk: text });
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        event.sender.send('kiro:stderr', { runId, chunk: text });
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

ipcMain.handle('kiro:cancel', (_evt, runId: string) => {
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

ipcMain.handle(
  'terminal:spawn',
  (
    _evt,
    payload: {
      petId: string;
      command?: string;
      args?: string[];
      cwd?: string;
      cols?: number;
      rows?: number;
    }
  ) => {
    const { petId, command, args, cwd, cols, rows } = payload;
    // Mata processo anterior se existir.
    const existing = terminalProcesses.get(petId);
    if (existing) {
      try { existing.kill(); } catch { /* noop */ }
      terminalProcesses.delete(petId);
    }

    const cmd = command || process.env.KIRO_COMMAND || 'kiro-cli';
    const finalArgs = sanitizeArgs(
      args && args.length > 0
        ? args
        : (process.env.KIRO_TASK_PREFIX || 'chat').split(' ').filter(Boolean)
    );

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(cmd, finalArgs, {
        name: 'xterm-256color',
        cols: cols ?? 100,
        rows: rows ?? 30,
        cwd: cwd || process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' } as { [key: string]: string },
      });
    } catch (err) {
      mainWindow?.webContents.send('terminal:exit', {
        petId,
        code: null,
        error: (err as Error).message,
      });
      return { ok: false, error: (err as Error).message };
    }

    terminalProcesses.set(petId, ptyProcess);

    ptyProcess.onData((data) => {
      mainWindow?.webContents.send('terminal:stdout', { petId, data });
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      terminalProcesses.delete(petId);
      mainWindow?.webContents.send('terminal:exit', {
        petId,
        code: exitCode,
        error: signal ? `signal ${signal}` : undefined,
      });
    });

    return { ok: true };
  }
);

ipcMain.handle('terminal:write', (_evt, payload: { petId: string; data: string }) => {
  const ptyProcess = terminalProcesses.get(payload.petId);
  if (!ptyProcess) return false;
  ptyProcess.write(payload.data);
  return true;
});

ipcMain.handle('terminal:resize', (_evt, payload: { petId: string; cols: number; rows: number }) => {
  const ptyProcess = terminalProcesses.get(payload.petId);
  if (!ptyProcess) return false;
  try {
    ptyProcess.resize(Math.max(1, payload.cols), Math.max(1, payload.rows));
  } catch {
    /* noop */
  }
  return true;
});

ipcMain.handle('terminal:kill', (_evt, petId: string) => {
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
