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

import { app, BrowserWindow, ipcMain, screen, Menu, dialog, clipboard, Notification, Tray, nativeImage, globalShortcut } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
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

// Abre o diálogo nativo de seleção de pasta. Retorna o caminho escolhido ou
// null se o usuário cancelou. Usado pelo menu "Pasta de trabalho…" para definir
// o cwd do PTY de cada pet.
ipcMain.handle('dialog:select-folder', async (_evt, defaultPathRaw: unknown) => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const defaultPath = isString(defaultPathRaw, 4096) ? defaultPathRaw : undefined;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pasta de trabalho do MESP',
    properties: ['openDirectory'],
    defaultPath,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ----- Clipboard (copiar/colar no terminal) ---------------------------------

const MAX_CLIPBOARD_TEXT = 1_000_000; // 1MB de texto colado, no máximo.

// Lê o texto atual do clipboard do sistema.
ipcMain.handle('clipboard:read-text', () => {
  const text = clipboard.readText();
  if (typeof text !== 'string') return '';
  return text.length > MAX_CLIPBOARD_TEXT ? text.slice(0, MAX_CLIPBOARD_TEXT) : text;
});

// Escreve texto no clipboard do sistema (usado ao copiar a seleção do terminal).
ipcMain.handle('clipboard:write-text', (_evt, textRaw: unknown) => {
  if (typeof textRaw !== 'string') return false;
  const text = textRaw.length > MAX_CLIPBOARD_TEXT ? textRaw.slice(0, MAX_CLIPBOARD_TEXT) : textRaw;
  clipboard.writeText(text);
  return true;
});

// Se houver uma imagem no clipboard, salva como PNG num diretório temporário e
// devolve o caminho. Retorna null se não houver imagem. Útil para colar imagens
// em CLIs de IA (Claude Code, etc.) que aceitam o caminho de um arquivo.
ipcMain.handle('clipboard:save-image', async (): Promise<string | null> => {
  let image;
  try {
    image = clipboard.readImage();
  } catch {
    return null;
  }
  if (!image || image.isEmpty()) return null;

  let png: Buffer;
  try {
    png = image.toPNG();
  } catch {
    return null;
  }
  if (!png || png.length === 0) return null;

  const dir = path.join(os.tmpdir(), 'mesp-pet-images');
  try {
    fs.mkdirSync(dir, { recursive: true });
    pruneOldImages(dir);
    const file = path.join(dir, `paste-${Date.now()}.png`);
    fs.writeFileSync(file, png);
    return file;
  } catch {
    return null;
  }
});

// Remove imagens coladas com mais de 24h para não acumular lixo no temp.
function pruneOldImages(dir: string): void {
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of entries) {
    if (!name.startsWith('paste-') || !name.endsWith('.png')) continue;
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > MAX_AGE_MS) fs.unlinkSync(full);
    } catch {
      /* noop */
    }
  }
}

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

// ----- Notificações do SO ----------------------------------------------------

// Mostra uma notificação nativa. Por padrão só notifica quando a janela NÃO
// está em foco (não adianta avisar o que o usuário já está olhando). Clicar
// na notificação traz a janela do MESP para frente.
ipcMain.handle('app:notify', (_evt, payloadRaw: unknown): boolean => {
  if (!Notification.isSupported()) return false;
  if (!payloadRaw || typeof payloadRaw !== 'object') return false;
  const payload = payloadRaw as Record<string, unknown>;

  const title = isString(payload.title, 200) ? payload.title : 'MESP';
  const body =
    typeof payload.body === 'string' && payload.body.length <= 1000 ? payload.body : '';
  const force = payload.force === true;

  if (!force && mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
    return false;
  }

  try {
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.showInactive();
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.focus();
      }
    });
    n.show();
    return true;
  } catch {
    return false;
  }
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

// ---------------------------------------------------------------------------
//  Tray, modo foco e atalho global (always-on respeitável)
// ---------------------------------------------------------------------------

let tray: Tray | null = null;
let windowVisible = true;
let focusMode = false;

// --- Gerador de ícone PNG (sem assets externos) ----------------------------
// node-pty/electron-builder não embute um ícone de tray garantido em todas as
// plataformas; geramos um PNG 32x32 em runtime com zlib (built-in), evitando
// dependência de arquivo. Desenha um "MESP" simples: corpo ciano + olho.

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeTrayImage(): Electron.NativeImage {
  const S = 32;
  const buf = Buffer.alloc(S * S * 4, 0);
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
  };
  const bodyR = 12;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const d = Math.hypot(x - 16, y - 17);
      if (d <= bodyR) {
        if (d > bodyR - 2) put(x, y, 22, 32, 51); // contorno
        else put(x, y, 111, 207, 238); // corpo ciano
      }
    }
  }
  // Olho ciclope: esclera branca + pupila escura.
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const de = Math.hypot(x - 16, y - 14);
      if (de <= 4.2) put(x, y, 255, 255, 255);
      if (de <= 2.0) put(x, y, 22, 32, 51);
    }
  }
  return nativeImage.createFromBuffer(encodePng(S, S, buf));
}

function toggleWindowVisibility(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    windowVisible = false;
  } else {
    mainWindow.showInactive();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    windowVisible = true;
  }
  updateTrayMenu();
}

function setFocusMode(v: boolean): void {
  focusMode = v;
  safeSend('app:focus-mode', focusMode);
  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: windowVisible ? 'Esconder pets' : 'Mostrar pets', click: () => toggleWindowVisibility() },
    {
      label: focusMode ? '🔕 Modo foco: LIGADO' : '🔔 Modo foco: desligado',
      type: 'checkbox',
      checked: focusMode,
      click: () => setFocusMode(!focusMode),
    },
    { type: 'separator' },
    { label: 'Atalhos: Ctrl+Shift+M (mostrar/esconder) · Ctrl+Shift+F (foco)', enabled: false },
    { type: 'separator' },
    { label: 'Sair do MESP', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createTray(): void {
  try {
    tray = new Tray(makeTrayImage());
  } catch {
    tray = null;
    return;
  }
  tray.setToolTip('MESP Pet');
  updateTrayMenu();
  // Clique simples mostra/esconde (Windows/Linux); no macOS abre o menu.
  tray.on('click', () => toggleWindowVisibility());
}

// IPC do modo foco (sincroniza tray <-> renderer).
ipcMain.handle('app:get-focus-mode', () => focusMode);
ipcMain.handle('app:set-focus-mode', (_evt, v: unknown) => {
  setFocusMode(v === true);
  return focusMode;
});
ipcMain.handle('app:toggle-visibility', () => {
  toggleWindowVisibility();
  return windowVisible;
});

app.whenReady().then(() => {
  loadDotEnv();
  // Identidade para notificações nativas no Windows.
  if (process.platform === 'win32') {
    app.setAppUserModelId('io.mesp.pet');
  }
  // Ativa auto-start com o Windows por padrão
  if (!app.getLoginItemSettings().openAtLogin) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  createWindow();
  createTray();

  // Atalhos globais: mostrar/esconder e alternar modo foco.
  try {
    globalShortcut.register('CommandOrControl+Shift+M', () => toggleWindowVisibility());
    globalShortcut.register('CommandOrControl+Shift+F', () => setFocusMode(!focusMode));
  } catch {
    /* alguns ambientes Linux bloqueiam atalhos globais; ignora */
  }

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
  try { globalShortcut.unregisterAll(); } catch { /* noop */ }
  if (tray) {
    try { tray.destroy(); } catch { /* noop */ }
    tray = null;
  }
  for (const child of runningProcesses.values()) {
    try { child.kill(); } catch { /* noop */ }
  }
  runningProcesses.clear();
  for (const ptyProcess of terminalProcesses.values()) {
    try { ptyProcess.kill(); } catch { /* noop */ }
  }
  terminalProcesses.clear();
});
