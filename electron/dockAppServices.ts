// App-level services for distributed builds: local logs, crash dumps, updates,
// diagnostics, per-project permission rules and user extensions (MCP + skills).
// Nothing here sends data anywhere except the update check against GitHub.
import { app, clipboard, crashReporter, dialog, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { updateMode, isNewerVersion } from './dockUpdatePolicy.mjs';
import { diagnosticsReport, formatLogLine, redactLogText } from './dockDiagnostics.mjs';
import {
  addRule,
  normalizeRuleStore,
  projectKey,
  removeRule,
  rulesAllow,
  type PermissionRuleStore,
} from './dockPermissionRules.mjs';
import {
  listMcpServers,
  mcpEntryFromForm,
  parseSkillFile,
  withMcpEnabled,
  withMcpServer,
  withoutMcpServer,
} from './dockExtensions.mjs';

const REPOSITORY = 'RubsNeto/mesp-pet';
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases/latest`;
const LOG_LIMIT_BYTES = 2 * 1024 * 1024;
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface AppServiceDeps {
  send: (channel: string, payload: unknown) => void;
  runtimeSummary: () => { node: string; opencode: string; router: string; accounts: string };
  readAgentConfig: () => Record<string, unknown>;
  writeAgentConfig: (config: Record<string, unknown>) => Promise<void>;
  agentConfigChanged: () => void;
  prepareQuit: () => void;
}

let deps: AppServiceDeps | null = null;

// ----- Logs ------------------------------------------------------------------

let logFile = '';

function logsDirectory(): string {
  return path.join(app.getPath('userData'), 'logs');
}

export function writeLog(level: 'info' | 'warn' | 'error' | 'fatal', message: unknown): void {
  if (!logFile) return;
  const text = message instanceof Error ? message.stack || message.message : String(message ?? '');
  try {
    fs.appendFileSync(logFile, formatLogLine(level, redactLogText(text, { home: os.homedir() })));
  } catch {
    // Logging must never break the app.
  }
}

function startLogging(): void {
  const directory = logsDirectory();
  try {
    fs.mkdirSync(directory, { recursive: true });
    logFile = path.join(directory, 'mesp.log');
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > LOG_LIMIT_BYTES) {
      fs.renameSync(logFile, path.join(directory, 'mesp.1.log'));
    }
  } catch {
    logFile = '';
    return;
  }
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      writeLog(
        level,
        args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      );
    };
  }
  process.on('uncaughtExceptionMonitor', (error) => writeLog('fatal', error));
  process.on('unhandledRejection', (reason) => writeLog('error', reason));
  app.on('render-process-gone', (_event, _contents, details) =>
    writeLog('error', `Interface encerrada: ${details.reason} (${details.exitCode})`),
  );
  app.on('child-process-gone', (_event, details) =>
    writeLog('warn', `Processo ${details.type} encerrado: ${details.reason}`),
  );
  try {
    crashReporter.start({ uploadToServer: false, compress: true });
  } catch {
    // Crash dumps are optional.
  }
  writeLog(
    'info',
    `MESP ${app.getVersion()} iniciado · ${process.platform} ${os.release()} ${process.arch}`,
  );
}

function logTail(lines: number): string[] {
  try {
    return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-lines);
  } catch {
    return [];
  }
}

// ----- Updates ---------------------------------------------------------------

export type UpdateState =
  | { status: 'off' | 'idle' | 'checking' | 'current'; version: string }
  | { status: 'downloading'; version: string; next: string; percent: number }
  | { status: 'ready'; version: string; next: string }
  | { status: 'manual'; version: string; next: string; url: string }
  | { status: 'error'; version: string; message: string };

const mode = () =>
  updateMode({
    packaged: app.isPackaged,
    platform: process.platform,
    appImage: process.env.APPIMAGE,
  });
let updateState: UpdateState = { status: 'idle', version: app.getVersion() };

function setUpdateState(next: UpdateState): void {
  updateState = next;
  deps?.send('app:update', next);
}

async function checkManually(): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'MESP-Updater' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status}.`);
  const release = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  const url =
    typeof release.html_url === 'string' && release.html_url.startsWith('https://github.com/')
      ? release.html_url
      : RELEASES_URL;
  setUpdateState(
    isNewerVersion(app.getVersion(), tag)
      ? { status: 'manual', version: app.getVersion(), next: tag.replace(/^v/, ''), url }
      : { status: 'current', version: app.getVersion() },
  );
}

export async function checkForUpdates(): Promise<UpdateState> {
  const current = mode();
  if (current === 'off') {
    setUpdateState({ status: 'off', version: app.getVersion() });
    return updateState;
  }
  if (updateState.status === 'downloading' || updateState.status === 'ready') return updateState;
  setUpdateState({ status: 'checking', version: app.getVersion() });
  try {
    if (current === 'auto') await autoUpdater.checkForUpdates();
    else await checkManually();
  } catch (error) {
    writeLog('warn', `Falha ao procurar atualização: ${String(error)}`);
    setUpdateState({
      status: 'error',
      version: app.getVersion(),
      message: 'Não foi possível procurar atualizações agora.',
    });
  }
  return updateState;
}

function startUpdater(): void {
  if (mode() === 'off') {
    updateState = { status: 'off', version: app.getVersion() };
    return;
  }
  if (mode() === 'auto') {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (message?: unknown) => writeLog('info', `updater: ${String(message)}`),
      warn: (message?: unknown) => writeLog('warn', `updater: ${String(message)}`),
      error: (message?: unknown) => writeLog('error', `updater: ${String(message)}`),
      debug: () => {},
    };
    autoUpdater.on('update-available', (info) =>
      setUpdateState({
        status: 'downloading',
        version: app.getVersion(),
        next: info.version,
        percent: 0,
      }),
    );
    autoUpdater.on('download-progress', (progress) => {
      if (updateState.status !== 'downloading') return;
      setUpdateState({ ...updateState, percent: Math.round(progress.percent) });
    });
    autoUpdater.on('update-downloaded', (info) =>
      setUpdateState({ status: 'ready', version: app.getVersion(), next: info.version }),
    );
    autoUpdater.on('update-not-available', () =>
      setUpdateState({ status: 'current', version: app.getVersion() }),
    );
    autoUpdater.on('error', (error) => {
      writeLog('warn', error);
      setUpdateState({
        status: 'error',
        version: app.getVersion(),
        message: 'A atualização falhou. O MESP tenta de novo mais tarde.',
      });
    });
  }
  setTimeout(() => void checkForUpdates(), 30_000).unref();
  setInterval(() => void checkForUpdates(), UPDATE_INTERVAL_MS).unref();
}

// ----- Permission rules ------------------------------------------------------

let ruleStore: PermissionRuleStore | null = null;

function rulesFile(): string {
  return path.join(app.getPath('userData'), 'permission-rules.json');
}

function rules(): PermissionRuleStore {
  if (ruleStore) return ruleStore;
  try {
    ruleStore = normalizeRuleStore(JSON.parse(fs.readFileSync(rulesFile(), 'utf8')));
  } catch {
    ruleStore = normalizeRuleStore(null);
  }
  return ruleStore;
}

function saveRules(next: PermissionRuleStore): void {
  ruleStore = next;
  try {
    fs.writeFileSync(rulesFile(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch (error) {
    writeLog('warn', error);
  }
}

/** True when the user already allowed this kind of action for the project folder. */
export function projectRuleAllows(cwd: string, permission: string, patterns: string[]): boolean {
  return rulesAllow(rules().projects[projectKey(cwd)]?.rules, { permission, patterns });
}

export function rememberProjectRule(cwd: string, permission: string, patterns: string[]): void {
  saveRules(addRule(rules(), projectKey(cwd), path.basename(cwd) || cwd, { permission, patterns }));
}

// ----- Extensions ------------------------------------------------------------

export function skillsDirectory(): string {
  return path.join(app.getPath('userData'), 'skills');
}

function listSkills() {
  const directory = skillsDirectory();
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        const parsed = parseSkillFile(
          fs.readFileSync(path.join(directory, entry.name, 'SKILL.md'), 'utf8'),
        );
        return parsed ? { folder: entry.name, ...parsed } : null;
      } catch {
        return null;
      }
    })
    .filter((item): item is { folder: string; name: string; description: string } => !!item)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function extensionsSnapshot() {
  const config = deps?.readAgentConfig() || {};
  return { mcp: listMcpServers(config), skills: listSkills() };
}

async function updateAgentConfig(
  change: (config: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  if (!deps) return;
  await deps.writeAgentConfig(change(deps.readAgentConfig()));
  deps.agentConfigChanged();
}

const validName = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/.test(value);

function registerIpc(): void {
  ipcMain.handle('app:update-state', () => updateState);
  ipcMain.handle('app:update-check', () => checkForUpdates());
  ipcMain.handle('app:update-install', () => {
    if (updateState.status === 'ready') {
      deps?.prepareQuit();
      setImmediate(() => autoUpdater.quitAndInstall(true, true));
      return true;
    }
    if (updateState.status === 'manual') {
      void shell.openExternal(updateState.url);
      return true;
    }
    return false;
  });

  ipcMain.handle('app:copy-diagnostics', () => {
    const runtimes = deps?.runtimeSummary() || {
      node: '?',
      opencode: '?',
      router: '?',
      accounts: '?',
    };
    const report = diagnosticsReport(
      {
        version: app.getVersion(),
        channel: mode(),
        os: `${process.platform} ${os.release()}`,
        arch: process.arch,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        locale: app.getLocale(),
        runtimes: { node: runtimes.node, opencode: runtimes.opencode, router: runtimes.router },
        accounts: runtimes.accounts,
      },
      logTail(150),
      { home: os.homedir() },
    );
    clipboard.writeText(report);
    return true;
  });
  ipcMain.handle('app:open-logs', async () => {
    fs.mkdirSync(logsDirectory(), { recursive: true });
    return (await shell.openPath(logsDirectory())) === '';
  });
  ipcMain.handle('app:report-issue', () => {
    const body = [
      '**O que aconteceu**',
      '',
      '**O que você esperava**',
      '',
      '**Diagnóstico** (Configurações → App → Copiar diagnóstico, e cole aqui)',
      '',
      `MESP ${app.getVersion()} · ${process.platform} ${os.release()} · ${process.arch}`,
    ].join('\n');
    void shell.openExternal(
      `https://github.com/${REPOSITORY}/issues/new?body=${encodeURIComponent(body)}`,
    );
    return true;
  });

  ipcMain.handle('permissions:list', () =>
    Object.entries(rules().projects).map(([key, entry]) => ({ key, ...entry })),
  );
  ipcMain.handle('permissions:remove', (_event, payload: unknown) => {
    const { key, index } = (payload || {}) as { key?: unknown; index?: unknown };
    if (typeof key !== 'string' || !Number.isInteger(index)) return false;
    saveRules(removeRule(rules(), key, index as number));
    return true;
  });

  ipcMain.handle('extensions:list', () => extensionsSnapshot());
  ipcMain.handle('extensions:add-mcp', async (_event, payload: unknown) => {
    const form = (payload || {}) as Record<string, unknown>;
    const result = mcpEntryFromForm({
      name: typeof form.name === 'string' ? form.name : '',
      type: form.type === 'remote' ? 'remote' : 'local',
      command: typeof form.command === 'string' ? form.command.slice(0, 4096) : '',
      url: typeof form.url === 'string' ? form.url.slice(0, 4096) : '',
    });
    if (result.error !== undefined) return { ok: false, error: result.error };
    await updateAgentConfig((config) => withMcpServer(config, result.name, result.entry));
    return { ok: true, ...extensionsSnapshot() };
  });
  ipcMain.handle('extensions:toggle-mcp', async (_event, payload: unknown) => {
    const { name, enabled } = (payload || {}) as { name?: unknown; enabled?: unknown };
    if (typeof name !== 'string') return { ok: false };
    await updateAgentConfig((config) => withMcpEnabled(config, name, enabled === true));
    return { ok: true, ...extensionsSnapshot() };
  });
  ipcMain.handle('extensions:remove-mcp', async (_event, name: unknown) => {
    if (typeof name !== 'string') return { ok: false };
    await updateAgentConfig((config) => withoutMcpServer(config, name));
    return { ok: true, ...extensionsSnapshot() };
  });
  ipcMain.handle('extensions:open-skills', async () => {
    fs.mkdirSync(skillsDirectory(), { recursive: true });
    return (await shell.openPath(skillsDirectory())) === '';
  });
  ipcMain.handle('extensions:import-skill', async () => {
    const choice = await dialog.showOpenDialog({
      title: 'Escolha a pasta da skill (com SKILL.md)',
      properties: ['openDirectory'],
    });
    const source = choice.filePaths[0];
    if (choice.canceled || !source) return { ok: false, cancelled: true };
    let parsed: { name: string; description: string } | null = null;
    try {
      parsed = parseSkillFile(fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8'));
    } catch {
      parsed = null;
    }
    if (!parsed) return { ok: false, error: 'A pasta precisa ter um SKILL.md com name no topo.' };
    const folder = path.basename(source);
    if (!validName(folder))
      return { ok: false, error: 'Renomeie a pasta usando letras e números.' };
    const target = path.join(skillsDirectory(), folder);
    await fs.promises.mkdir(skillsDirectory(), { recursive: true });
    await fs.promises.cp(source, target, { recursive: true, force: true });
    deps?.agentConfigChanged();
    return { ok: true, ...extensionsSnapshot() };
  });
  ipcMain.handle('extensions:remove-skill', async (_event, folder: unknown) => {
    if (!validName(folder)) return { ok: false };
    const target = path.join(skillsDirectory(), folder);
    if (path.dirname(target) !== skillsDirectory()) return { ok: false };
    await fs.promises.rm(target, { recursive: true, force: true });
    deps?.agentConfigChanged();
    return { ok: true, ...extensionsSnapshot() };
  });
}

/** Call once, before the app is ready (logging must start as early as possible). */
export function startAppServices(serviceDeps: AppServiceDeps): void {
  deps = serviceDeps;
  startLogging();
  registerIpc();
  app.whenReady().then(startUpdater, () => {});
}
