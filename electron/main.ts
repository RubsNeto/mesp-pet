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

import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Menu,
  dialog,
  clipboard,
  Notification,
  Tray,
  nativeImage,
  globalShortcut,
  shell,
} from 'electron';
import { spawn, spawnSync, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as net from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import * as zlib from 'node:zlib';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import {
  addTokenUsage,
  buildFastMessages,
  buildOpenCodeArgs,
  createBoundedProjectCheckOutput,
  discoverProjectChecks,
  extractSSEData,
  extractOpenCodeApiCredential,
  hasActiveRouterConnections,
  isMespCodeMode,
  isLoopbackRouterURL,
  modelIdFor9Router,
  normalizeProjectChecks,
  parseDotEnvValue,
  parseOpenAIStreamData,
  projectCheckFinalState,
  publicOpenCodeEvent,
  resolveOpenCodeConfigValue,
  routerOriginForApiBase,
  tokenUsageFromOpenCodeEvent,
  totalTokensFromUsage,
  type MespTokenUsage,
  type MespCodeMode,
  type ProjectCheckName,
} from '../src/services/mespCodeCore.mjs';

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
const MODEL_PATTERN = /^9router\/[A-Za-z0-9._/+:-]{1,240}$/;
const MAX_MESP_PROMPT_LENGTH = 24_000;
const MAX_MESP_HISTORY_ITEMS = 10;
const MAX_MESP_HISTORY_ITEM_LENGTH = 12_000;
const MAX_MESP_HISTORY_LENGTH = 24_000;
const MESP_DEFAULT_LIMITS = {
  maxDurationMs: 5 * 60_000,
  maxTokens: 25_000,
  maxToolCalls: 50,
} as const;

const MESP_ASSISTED_PERMISSION_RULES = [
  { permission: '*', pattern: '*', action: 'ask' },
  { permission: 'read', pattern: '*', action: 'allow' },
  { permission: 'glob', pattern: '*', action: 'allow' },
  { permission: 'grep', pattern: '*', action: 'allow' },
  { permission: 'list', pattern: '*', action: 'allow' },
  { permission: 'lsp', pattern: '*', action: 'allow' },
  { permission: 'todowrite', pattern: '*', action: 'allow' },
  { permission: 'question', pattern: '*', action: 'deny' },
  { permission: 'external_directory', pattern: '*', action: 'deny' },
  { permission: 'doom_loop', pattern: '*', action: 'deny' },
] as const;
const MAX_MESP_DIFF_FILES = 200;
const MAX_MESP_DIFF_PATCH_LENGTH = 200_000;
const MAX_MESP_DIFF_TOTAL_LENGTH = 1_000_000;
const MAX_PROJECT_PACKAGE_JSON_BYTES = 1_000_000;
const MAX_OPENCODE_AUTH_BYTES = 1_000_000;
const MAX_PROJECT_CHECK_OUTPUT = 160_000;
const MAX_PROJECT_CHECK_DURATION_MS = 5 * 60_000;
const DEFAULT_NINEROUTER_BASE_URL = 'http://127.0.0.1:20127/v1';
const ROUTER_START_TIMEOUT_MS = 30_000;
const MAX_PROJECT_CHECK_RUNS = 4;
const MAX_PROJECT_CHECK_SUITE_DURATION_MS = 12 * 60_000;
const LEGACY_OPENCODE_CONFIG_PATH = path.join(
  os.homedir(),
  '.config',
  'opencode',
  'opencode.json',
);
const MESP_AGENT_CONFIG = {
  compaction: { auto: true, prune: true },
  watcher: {
    ignore: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'release/**',
      'coverage/**',
      '.git/**',
    ],
  },
  agent: {
    'mesp-assisted': {
      description: 'MESP supervised coding agent with per-action approval',
      mode: 'primary',
      prompt:
        'Implemente a tarefa com cuidado e use as ferramentas necessarias normalmente. O sistema pausara automaticamente antes de cada acao sensivel e pedira aprovacao ao usuario; nao peca aprovacao em texto. Preserve alteracoes existentes do usuario.',
      permission: {
        '*': 'ask',
        read: 'allow',
        glob: 'allow',
        grep: 'allow',
        list: 'allow',
        lsp: 'allow',
        todowrite: 'allow',
        question: 'deny',
        external_directory: 'deny',
        doom_loop: 'deny',
      },
    },
    'mesp-plan': {
      description: 'MESP read-only planning agent',
      mode: 'primary',
      prompt:
        'Analise o projeto e produza um plano claro. Nao altere arquivos, nao execute comandos e nao delegue tarefas.',
      permission: {
        edit: 'deny',
        bash: 'deny',
        task: 'deny',
        external_directory: 'deny',
        todowrite: 'deny',
        doom_loop: 'deny',
      },
    },
    'mesp-autonomous': {
      description: 'MESP autonomous agent with unrestricted tool access',
      mode: 'primary',
      prompt:
        'Trabalhe de forma totalmente autonoma ate concluir. Pode ler, editar e executar comandos em qualquer diretorio necessario. Nao pare para pedir confirmacao.',
      permission: { '*': 'allow' },
    },
  },
} as const;

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
    const value = parseDotEnvValue(line.slice(eq + 1));
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

let mainWindow: BrowserWindow | null = null;
let routerDashboardWindow: BrowserWindow | null = null;

// Map de processos em andamento, por runId, para suportar cancelamento.
const runningProcesses = new Map<string, ChildProcessWithoutNullStreams>();

// Processos persistentes de terminal (um por pet) — PTY real (node-pty).
const terminalProcesses = new Map<string, pty.IPty>();

interface MespCodeProcessRun {
  requestId: string;
  child: ChildProcessWithoutNullStreams;
  cancelled: boolean;
  limitError?: string;
}

interface MespCodeFetchRun {
  requestId: string;
  controller: AbortController;
  cancelled: boolean;
  limitError?: string;
}

interface MespCodeLimits {
  maxDurationMs: number;
  maxTokens: number;
  maxToolCalls: number;
}

interface MespCodeServerState {
  child: ChildProcessWithoutNullStreams;
  baseURL: string;
  authorization: string;
}

interface MespCodeServerRun {
  requestId: string;
  cwd: string;
  sessionId: string | null;
  controller: AbortController;
  cancelled: boolean;
  limitError?: string;
  pendingPermissions: Set<string>;
  finish: (code: number | null, error?: string) => void;
}

interface ProjectCheckRun {
  verificationId: string;
  child: ChildProcessWithoutNullStreams | null;
  stopReason: 'cancelled' | 'suite-timeout' | 'shutdown' | null;
  termination: Promise<void> | null;
}

type InstalledRuntimeSource = 'bundled' | 'system' | 'custom' | 'missing';
type RouterRuntimeSource = 'bundled' | 'external' | 'starting' | 'unavailable';

interface BundledRouterState {
  child: ChildProcessWithoutNullStreams;
  baseURL: string;
  origin: string;
}

// Processos headless do chat nativo MESP Code (um por pet).
const mespCodeProcesses = new Map<string, MespCodeProcessRun>();
const mespCodeFetches = new Map<string, MespCodeFetchRun>();
const mespCodeServerRuns = new Map<string, MespCodeServerRun>();
const projectCheckRuns = new Map<string, ProjectCheckRun>();

let mespCodeServer: MespCodeServerState | null = null;
let mespCodeServerPromise: Promise<MespCodeServerState> | null = null;
let bundledRouter: BundledRouterState | null = null;
let bundledRouterPromise: Promise<RouterRuntimeSource> | null = null;
let routerRuntimeSource: RouterRuntimeSource = 'unavailable';
let applicationQuitting = false;

let lastModelSyncAt = 0;
let lastModelSyncAttemptAt = 0;
let modelSyncPromise: Promise<void> | null = null;
let rejectedRouterCredentialHash: string | null = null;
type RouterConnectionState =
  | 'unknown'
  | 'ready'
  | 'unauthorized'
  | 'unreachable'
  | 'misconfigured';
let routerConnectionStatus: {
  state: RouterConnectionState;
  message: string;
  checkedAt: number | null;
} = {
  state: 'unknown',
  message: 'Conexao ainda nao verificada.',
  checkedAt: null,
};

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

function isExistingFile(candidate: string | null | undefined): candidate is string {
  if (!candidate) return false;
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function bundledNodeModulesRoots(): string[] {
  const candidates: string[] = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
  ];
  try {
    candidates.push(path.join(app.getAppPath(), 'node_modules'));
  } catch {
    // app.getAppPath pode nao estar disponivel nos primeiros instantes do bootstrap.
  }
  candidates.push(path.resolve(__dirname, '..', 'node_modules'));
  return Array.from(new Set(candidates));
}

function bundledRuntimeFile(...segments: string[]): string | null {
  for (const root of bundledNodeModulesRoots()) {
    const candidate = path.join(root, ...segments);
    if (isExistingFile(candidate)) return candidate;
  }
  return null;
}

function commandOnPath(command: string): string | null {
  const pathEntries = (process.env.PATH || process.env.Path || '')
    .split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : [''];
  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension.toLowerCase()}`);
      if (isExistingFile(candidate)) return candidate;
      const upperCandidate = path.join(entry, `${command}${extension.toUpperCase()}`);
      if (upperCandidate !== candidate && isExistingFile(upperCandidate)) return upperCandidate;
    }
  }
  return null;
}

function resolveBundledNodeBinary(): string | null {
  return bundledRuntimeFile('node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
}

function resolveBundledNpmCli(): string | null {
  return bundledRuntimeFile('npm', 'bin', 'npm-cli.js');
}

function resolveBundled9RouterServer(): string | null {
  const resourceCandidates = [
    path.join(process.resourcesPath, 'runtime', '9router', 'app', 'custom-server.js'),
    path.join(process.resourcesPath, 'runtime', '9router', 'app', 'server.js'),
  ];
  return (
    resourceCandidates.find((candidate) => isExistingFile(candidate)) ||
    bundledRuntimeFile('9router', 'app', 'custom-server.js') ||
    bundledRuntimeFile('9router', 'app', 'server.js')
  );
}

function resolveBundledOpenCodeBinary(): string | null {
  const executable = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  return bundledRuntimeFile('opencode-ai', 'bin', executable);
}

function resolveNodeRuntime(): { binary: string; source: InstalledRuntimeSource } {
  const bundled = resolveBundledNodeBinary();
  if (bundled) return { binary: bundled, source: 'bundled' };
  const system = commandOnPath('node');
  return system ? { binary: system, source: 'system' } : { binary: 'node', source: 'missing' };
}

function resolveOpenCodeRuntime(): { binary: string; source: InstalledRuntimeSource } {
  const override = process.env.OPENCODE_BINARY;
  if (isExistingFile(override)) return { binary: override, source: 'custom' };

  const bundled = resolveBundledOpenCodeBinary();
  if (bundled) return { binary: bundled, source: 'bundled' };

  const knownSystemCandidates =
    process.platform === 'win32'
      ? [
          path.join(
            process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
            'npm',
            'node_modules',
            'opencode-ai',
            'bin',
            'opencode.exe',
          ),
          path.join(os.homedir(), '.opencode', 'bin', 'opencode.exe'),
        ]
      : [path.join(os.homedir(), '.opencode', 'bin', 'opencode')];
  const knownSystem = knownSystemCandidates.find((candidate) => isExistingFile(candidate));
  if (knownSystem) return { binary: knownSystem, source: 'system' };
  const pathCommand = commandOnPath('opencode');
  return pathCommand
    ? { binary: pathCommand, source: 'system' }
    : { binary: 'opencode', source: 'missing' };
}

function mespOpenCodeConfigPath(): string {
  if (!app.isReady()) return LEGACY_OPENCODE_CONFIG_PATH;
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}

function readOpenCodeConfig(): Record<string, unknown> {
  const primary = mespOpenCodeConfigPath();
  const candidates =
    primary === LEGACY_OPENCODE_CONFIG_PATH
      ? [primary]
      : [primary, LEGACY_OPENCODE_CONFIG_PATH];
  for (const candidate of candidates) {
    try {
      return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as Record<string, unknown>;
    } catch {
      // Tenta a configuracao legada apenas durante a primeira migracao.
    }
  }
  return {};
}

function openCodeStatusFromConfig(parsed: Record<string, unknown>) {
  const providerRoot = parsed.provider;
  const provider =
    providerRoot && typeof providerRoot === 'object'
      ? (providerRoot as Record<string, unknown>)['9router']
      : null;
  const modelsRoot =
    provider && typeof provider === 'object' ? (provider as Record<string, unknown>).models : null;
  const modelIds =
    modelsRoot && typeof modelsRoot === 'object'
      ? Object.keys(modelsRoot as Record<string, unknown>).sort((a, b) => a.localeCompare(b))
      : [];
  const models = modelIds.map((id) => `9router/${id}`);
  const providerPrefixes = Array.from(
    new Set(modelIds.map((id) => id.split('/')[0]).filter(Boolean)),
  ).sort();
  const openCodeRuntime = resolveOpenCodeRuntime();
  const nodeRuntime = resolveNodeRuntime();
  const npmRuntime = resolveNpmRunner();
  const routerBundledAvailable = Boolean(resolveBundled9RouterServer());
  return {
    model: typeof parsed.model === 'string' ? parsed.model : null,
    modelCount: models.length,
    providerPrefixes,
    models,
    routerState: routerConnectionStatus.state,
    routerMessage: routerConnectionStatus.message,
    routerCheckedAt: routerConnectionStatus.checkedAt,
    runtime: {
      opencode: openCodeRuntime.source,
      node: nodeRuntime.source,
      npm: npmRuntime?.source || 'missing',
      router: routerRuntimeSource,
      routerBundledAvailable,
      portableReady:
        openCodeRuntime.source === 'bundled' &&
        nodeRuntime.source === 'bundled' &&
        npmRuntime?.source === 'bundled' &&
        routerBundledAvailable,
      setupRequired:
        routerConnectionStatus.state === 'misconfigured' || modelIds.length === 0,
    },
  };
}

function setRouterConnectionStatus(state: RouterConnectionState, message: string): void {
  routerConnectionStatus = { state, message, checkedAt: Date.now() };
}

function routerCredentialHash(value: string | null): string | null {
  return value ? createHash('sha256').update(value).digest('hex') : null;
}

function noteRouterAuthenticationError(error: unknown): void {
  const message = String(error || '');
  if (!/\b(?:401|403)\b|unauthori[sz]ed|authentication failed/i.test(message)) return;
  rejectedRouterCredentialHash = routerCredentialHash(
    configured9RouterOptions(readOpenCodeConfig()).apiKey,
  );
  setRouterConnectionStatus(
    'unauthorized',
    'O 9Router recusou a autenticacao. Atualize a credencial configurada e tente novamente.',
  );
}

function readOpenCodeApiCredential(providerId: string): string | null {
  const candidates = [
    process.env.OPENCODE_AUTH_JSON,
    path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json'),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'opencode', 'auth.json')
      : null,
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of new Set(candidates)) {
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_OPENCODE_AUTH_BYTES) continue;
      const credential = extractOpenCodeApiCredential(
        fs.readFileSync(candidate, 'utf-8'),
        providerId,
      );
      if (credential) return credential;
    } catch {
      // Arquivo ausente, ilegivel ou invalido: tenta a proxima localizacao conhecida.
    }
  }
  return null;
}

function configured9RouterOptions(config: Record<string, unknown>): {
  baseURL: string;
  storedBaseURL: string;
  apiKey: string | null;
} {
  const providerRoot =
    config.provider && typeof config.provider === 'object'
      ? (config.provider as Record<string, unknown>)
      : {};
  const provider =
    providerRoot['9router'] && typeof providerRoot['9router'] === 'object'
      ? (providerRoot['9router'] as Record<string, unknown>)
      : {};
  const options =
    provider.options && typeof provider.options === 'object'
      ? (provider.options as Record<string, unknown>)
      : {};
  const rawBaseURL =
    process.env.NINEROUTER_BASE_URL ||
    (typeof options.baseURL === 'string' && options.baseURL.trim()
      ? options.baseURL.trim()
      : DEFAULT_NINEROUTER_BASE_URL);
  const baseURL =
    resolveOpenCodeConfigValue(rawBaseURL, process.env)?.replace(/\/$/, '') ||
    DEFAULT_NINEROUTER_BASE_URL;
  const apiKey =
    resolveOpenCodeConfigValue(options.apiKey, process.env) ||
    resolveOpenCodeConfigValue(process.env.NINEROUTER_API_KEY, process.env) ||
    readOpenCodeApiCredential('9router');
  return { baseURL, storedBaseURL: rawBaseURL, apiKey };
}

function routerRuntimeEnvironment(
  dataDir: string,
  port: number,
  hostname: string,
  origin: string,
  initialPassword: string | null,
): NodeJS.ProcessEnv {
  const allowed = new Set([
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'ComSpec',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'LANG',
  ]);
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    NO_COLOR: '1',
    DATA_DIR: dataDir,
    PORT: String(port),
    HOSTNAME: hostname,
    BASE_URL: origin,
    NEXT_PUBLIC_BASE_URL: origin,
    REQUIRE_API_KEY: 'false',
    ENABLE_REQUEST_LOGS: 'false',
    ...(initialPassword ? { INITIAL_PASSWORD: initialPassword } : {}),
  };
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && (allowed.has(name) || name.startsWith('LC_'))) {
      environment[name] = value;
    }
  }
  return environment;
}

async function initializeIntegratedRouterDashboard(
  origin: string,
  initialPassword: string,
): Promise<boolean> {
  try {
    const login = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: initialPassword }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!login.ok) return false;
    const setCookie = login.headers.get('set-cookie');
    const cookie = setCookie?.split(';', 1)[0];
    if (!cookie) return false;
    const update = await fetch(`${origin}/api/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ requireLogin: false, tunnelDashboardAccess: false }),
      signal: AbortSignal.timeout(5_000),
    });
    return update.ok;
  } catch {
    return false;
  }
}

async function routerEndpointResponds(baseURL: string, timeoutMs = 1_500): Promise<boolean> {
  try {
    await fetch(`${baseURL}/models`, { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

async function integratedRouterHasProviders(baseURL: string): Promise<boolean | null> {
  const origin = routerOriginForApiBase(baseURL);
  if (!origin) return null;
  try {
    const response = await fetch(`${origin}/api/providers`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    return hasActiveRouterConnections(await response.json());
  } catch {
    return null;
  }
}

async function ensure9RouterRuntime(baseURL: string): Promise<RouterRuntimeSource> {
  if (bundledRouterPromise) return bundledRouterPromise;
  if (
    bundledRouter &&
    bundledRouter.baseURL === baseURL &&
    bundledRouter.child.exitCode === null &&
    !bundledRouter.child.killed
  ) {
    routerRuntimeSource = 'bundled';
    return routerRuntimeSource;
  }

  bundledRouterPromise = (async () => {
    if (bundledRouter && bundledRouter.baseURL !== baseURL) {
      const previous = bundledRouter;
      bundledRouter = null;
      await terminateProjectCheckProcess(previous.child);
    }

    if (await routerEndpointResponds(baseURL)) {
      routerRuntimeSource = 'external';
      return routerRuntimeSource;
    }

    const origin = routerOriginForApiBase(baseURL);
    const nodeRuntime = resolveNodeRuntime();
    const serverPath = resolveBundled9RouterServer();
    let parsed: URL;
    try {
      parsed = new URL(baseURL);
    } catch {
      routerRuntimeSource = 'unavailable';
      return routerRuntimeSource;
    }
    if (!origin || parsed.protocol !== 'http:' || !serverPath || nodeRuntime.source === 'missing') {
      routerRuntimeSource = 'unavailable';
      return routerRuntimeSource;
    }

    const port = Number(parsed.port || '80');
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      routerRuntimeSource = 'unavailable';
      return routerRuntimeSource;
    }
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '') === '::1' ? '::1' : '127.0.0.1';
    const dataDir = path.join(app.getPath('userData'), '9router');
    await fs.promises.mkdir(dataDir, { recursive: true });
    const managedMarker = path.join(dataDir, '.mesp-managed-v1');
    const needsDashboardInitialization = !isExistingFile(managedMarker);
    const initialPassword = needsDashboardInitialization
      ? randomBytes(32).toString('base64url')
      : null;
    routerRuntimeSource = 'starting';

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(nodeRuntime.binary, [serverPath], {
        cwd: path.dirname(serverPath),
        shell: false,
        windowsHide: true,
        env: routerRuntimeEnvironment(dataDir, port, hostname, origin, initialPassword),
      });
    } catch {
      routerRuntimeSource = 'unavailable';
      return routerRuntimeSource;
    }
    child.stdout.resume();
    child.stderr.resume();
    let launchError = false;
    child.once('error', () => {
      launchError = true;
    });
    const state: BundledRouterState = { child, baseURL, origin };
    bundledRouter = state;
    child.once('close', () => {
      if (bundledRouter !== state) return;
      bundledRouter = null;
      if (!applicationQuitting) {
        routerRuntimeSource = 'unavailable';
        setRouterConnectionStatus(
          'unreachable',
          'O 9Router integrado foi encerrado. Tente iniciar novamente.',
        );
      }
    });

    const deadline = Date.now() + ROUTER_START_TIMEOUT_MS;
    while (Date.now() < deadline && !applicationQuitting) {
      if (launchError || child.exitCode !== null) break;
      if (await routerEndpointResponds(baseURL, 1_000)) {
        if (
          initialPassword &&
          !(await initializeIntegratedRouterDashboard(origin, initialPassword))
        ) {
          break;
        }
        if (initialPassword) {
          await fs.promises.writeFile(managedMarker, 'managed-local-runtime-v1\n', 'utf8');
        }
        routerRuntimeSource = 'bundled';
        return routerRuntimeSource;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await terminateProjectCheckProcess(child);
    routerRuntimeSource = 'unavailable';
    return routerRuntimeSource;
  })().finally(() => {
    bundledRouterPromise = null;
  });
  return bundledRouterPromise;
}

async function sync9RouterModels(force = false): Promise<void> {
  const now = Date.now();
  if (!force && (now - lastModelSyncAt < 60_000 || now - lastModelSyncAttemptAt < 5_000)) return;
  if (modelSyncPromise) return modelSyncPromise;
  modelSyncPromise = (async () => {
    lastModelSyncAttemptAt = Date.now();
    const config = readOpenCodeConfig();
    const providerRoot =
      config.provider && typeof config.provider === 'object'
        ? (config.provider as Record<string, unknown>)
        : {};
    const provider =
      providerRoot['9router'] && typeof providerRoot['9router'] === 'object'
        ? (providerRoot['9router'] as Record<string, unknown>)
        : {};
    const options =
      provider.options && typeof provider.options === 'object'
        ? (provider.options as Record<string, unknown>)
        : {};
    const { baseURL, storedBaseURL, apiKey } = configured9RouterOptions(config);

    try {
      await ensure9RouterRuntime(baseURL);
      const headers = new Headers();
      if (apiKey) headers.set('authorization', `Bearer ${apiKey}`);
      const response = await fetch(`${baseURL}/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 401 || response.status === 403) {
        rejectedRouterCredentialHash = routerCredentialHash(apiKey);
        setRouterConnectionStatus(
          'unauthorized',
          'O 9Router recusou a autenticacao. Atualize a credencial configurada e tente novamente.',
        );
        return;
      }
      if (!response.ok) {
        setRouterConnectionStatus(
          'unreachable',
          `O 9Router respondeu HTTP ${response.status} ao consultar os modelos.`,
        );
        return;
      }
      const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
      const modelIds = Array.from(
        new Set(
          (Array.isArray(payload.data) ? payload.data : [])
            .map((entry) => entry?.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b));
      if (modelIds.length === 0) {
        lastModelSyncAt = Date.now();
        setRouterConnectionStatus(
          'misconfigured',
          'O 9Router integrado esta pronto. Conecte pelo menos um provedor para liberar modelos.',
        );
        return;
      }

      const existingModels =
        provider.models && typeof provider.models === 'object'
          ? (provider.models as Record<string, unknown>)
          : {};
      const models: Record<string, unknown> = {};
      for (const id of modelIds) {
        const existing =
          existingModels[id] && typeof existingModels[id] === 'object'
            ? (existingModels[id] as Record<string, unknown>)
            : {};
        models[id] = { ...existing, name: typeof existing.name === 'string' ? existing.name : id };
      }

      config.$schema = config.$schema || 'https://opencode.ai/config.json';
      config.provider = {
        ...providerRoot,
        '9router': {
          ...provider,
          npm: '@ai-sdk/openai-compatible',
          name: '9Router (sincronizado)',
          options: { ...options, baseURL: storedBaseURL },
          models,
        },
      };
      const existingCompaction =
        config.compaction && typeof config.compaction === 'object'
          ? (config.compaction as Record<string, unknown>)
          : {};
      const existingWatcher =
        config.watcher && typeof config.watcher === 'object'
          ? (config.watcher as Record<string, unknown>)
          : {};
      const existingAgent =
        config.agent && typeof config.agent === 'object'
          ? (config.agent as Record<string, unknown>)
          : {};
      const existingIgnore = Array.isArray(existingWatcher.ignore)
        ? existingWatcher.ignore.filter((entry): entry is string => typeof entry === 'string')
        : [];
      config.compaction = { ...existingCompaction, ...MESP_AGENT_CONFIG.compaction };
      config.watcher = {
        ...existingWatcher,
        ignore: Array.from(new Set([...existingIgnore, ...MESP_AGENT_CONFIG.watcher.ignore])),
      };
      config.agent = { ...existingAgent, ...MESP_AGENT_CONFIG.agent };
      const currentModel = typeof config.model === 'string' ? config.model : '';
      if (
        !currentModel ||
        (currentModel.startsWith('9router/') &&
          !modelIds.includes(currentModel.slice('9router/'.length)))
      ) {
        const preferred = modelIds.includes('cx/gpt-5.4') ? 'cx/gpt-5.4' : modelIds[0]!;
        config.model = `9router/${preferred}`;
      }
      const configPath = mespOpenCodeConfigPath();
      await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
      await fs.promises.writeFile(
        configPath,
        `${JSON.stringify(config, null, 2)}\n`,
        'utf-8',
      );
      lastModelSyncAt = Date.now();
      const hasIntegratedProviders =
        routerRuntimeSource === 'bundled' ? await integratedRouterHasProviders(baseURL) : null;
      const credentialHash = routerCredentialHash(apiKey);
      if (hasIntegratedProviders === false) {
        rejectedRouterCredentialHash = null;
        setRouterConnectionStatus(
          'misconfigured',
          'O 9Router integrado esta pronto. Conecte pelo menos um provedor para comecar.',
        );
      } else if (credentialHash && credentialHash === rejectedRouterCredentialHash) {
        setRouterConnectionStatus(
          'unauthorized',
          'O 9Router recusou esta credencial ao enviar uma mensagem. Atualize-a e tente novamente.',
        );
      } else {
        rejectedRouterCredentialHash = null;
        const acceptsLocalRequests = isLoopbackRouterURL(baseURL);
        setRouterConnectionStatus(
          apiKey || acceptsLocalRequests ? 'ready' : 'misconfigured',
          apiKey
            ? '9Router conectado e autenticacao configurada.'
            : acceptsLocalRequests
              ? '9Router integrado e modelos prontos para uso local.'
              : 'Modelos encontrados, mas nenhuma credencial foi configurada para envio remoto.',
        );
      }
    } catch {
      setRouterConnectionStatus(
        'unreachable',
        'Nao foi possivel conectar ao 9Router. Confirme se o servico esta em execucao.',
      );
    }
  })().finally(() => {
    modelSyncPromise = null;
  });
  return modelSyncPromise;
}

function resolveOpenCodeBinary(): string {
  return resolveOpenCodeRuntime().binary;
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error('Nao foi possivel reservar uma porta local.'));
        else resolve(port);
      });
    });
  });
}

async function ensureMespCodeServer(): Promise<MespCodeServerState> {
  if (mespCodeServer && !mespCodeServer.child.killed) return mespCodeServer;
  if (mespCodeServerPromise) return mespCodeServerPromise;

  mespCodeServerPromise = (async () => {
    const port = await reserveLoopbackPort();
    const password = randomBytes(24).toString('base64url');
    const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
    const baseURL = `http://127.0.0.1:${port}`;
    const child = spawn(
      resolveOpenCodeBinary(),
      ['serve', '--hostname', '127.0.0.1', '--port', String(port)],
      {
        cwd: process.cwd(),
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          NO_COLOR: '1',
          OPENCODE_CONFIG: mespOpenCodeConfigPath(),
          OPENCODE_DISABLE_AUTOUPDATE: '1',
          OPENCODE_SERVER_PASSWORD: password,
          OPENCODE_CONFIG_CONTENT: JSON.stringify(MESP_AGENT_CONFIG),
        },
      },
    );
    let launchError: Error | null = null;
    child.once('error', (error) => {
      launchError = error;
    });
    child.stdout.resume();
    child.stderr.resume();

    const state: MespCodeServerState = { child, baseURL, authorization };
    child.once('close', () => {
      if (mespCodeServer === state) mespCodeServer = null;
    });

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (launchError) throw new Error('Nao foi possivel iniciar o servidor local do OpenCode.');
      if (child.exitCode != null) throw new Error('O servidor do OpenCode encerrou ao iniciar.');
      try {
        const response = await fetch(`${baseURL}/global/health`, {
          headers: { authorization },
          signal: AbortSignal.timeout(1_000),
        });
        if (response.ok) {
          mespCodeServer = state;
          return state;
        }
      } catch {
        // O servidor ainda esta iniciando.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    try {
      child.kill();
    } catch {
      /* noop */
    }
    throw new Error('O servidor do OpenCode nao iniciou em 15 segundos.');
  })().finally(() => {
    mespCodeServerPromise = null;
  });
  return mespCodeServerPromise;
}

async function mespServerFetch(
  server: MespCodeServerState,
  cwd: string,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(pathname, server.baseURL);
  url.searchParams.set('directory', cwd);
  const headers = new Headers(init.headers);
  headers.set('authorization', server.authorization);
  if (init.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}

async function mespServerJson<T>(
  server: MespCodeServerState,
  cwd: string,
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await mespServerFetch(server, cwd, pathname, init);
  if (!response.ok) {
    throw new Error(`OpenCode respondeu ${response.status} em ${pathname}.`);
  }
  return (await response.json()) as T;
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

ipcMain.handle(
  'app:set-ignore-mouse-events',
  (_evt, ignoreRaw: unknown, forwardRaw: unknown = true) => {
    const ignore = ignoreRaw === true;
    const forward = forwardRaw !== false;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setIgnoreMouseEvents(ignore, ignore ? { forward } : undefined);
  },
);

ipcMain.handle('app:quit', () => {
  app.quit();
});

ipcMain.handle('app:open-devtools', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.openDevTools({ mode: 'detach' });
});

ipcMain.handle('app:get-config', () => ({
  kiroCommand: process.env.KIRO_COMMAND || '9code',
  kiroTaskPrefix: process.env.KIRO_TASK_PREFIX || '',
  kiroDefaultArgs: process.env.KIRO_DEFAULT_ARGS || '',
}));

// Le somente metadados publicos e atualiza o catalogo pelo endpoint local do
// 9Router. A chave e as demais opcoes do provider nunca atravessam o IPC.
ipcMain.handle('opencode:get-status', async (_event, forceRaw: unknown) => {
  await sync9RouterModels(forceRaw === true);
  return openCodeStatusFromConfig(readOpenCodeConfig());
});

ipcMain.handle('opencode:open-router-dashboard', async () => {
  const { baseURL } = configured9RouterOptions(readOpenCodeConfig());
  const origin = routerOriginForApiBase(baseURL);
  if (!origin) {
    return { ok: false, error: 'O painel integrado esta disponivel apenas para o 9Router local.' };
  }
  const runtime = await ensure9RouterRuntime(baseURL);
  if (runtime === 'unavailable') {
    return { ok: false, error: 'Nao foi possivel iniciar o 9Router integrado.' };
  }
  const dashboardURL = new URL('/dashboard', `${origin}/`).toString();
  if (routerDashboardWindow && !routerDashboardWindow.isDestroyed()) {
    if (routerDashboardWindow.isMinimized()) routerDashboardWindow.restore();
    routerDashboardWindow.show();
    routerDashboardWindow.focus();
    return { ok: true };
  }

  const dashboard = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 820,
    minHeight: 600,
    title: 'MESP - Configuracao do 9Router',
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    modal: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#10131a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  routerDashboardWindow = dashboard;
  dashboard.setAlwaysOnTop(true, 'floating');
  const handleExternalNavigation = (target: string) => {
    try {
      const targetURL = new URL(target);
      if (targetURL.origin === origin) {
        void dashboard.loadURL(target);
      } else if (targetURL.protocol === 'https:' || targetURL.protocol === 'http:') {
        void shell.openExternal(target);
      }
    } catch {
      // URL invalida: ignora.
    }
  };
  dashboard.webContents.setWindowOpenHandler(({ url }) => {
    handleExternalNavigation(url);
    return { action: 'deny' };
  });
  dashboard.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin === origin) return;
    } catch {
      // Bloqueia navegacao invalida.
    }
    event.preventDefault();
    handleExternalNavigation(url);
  });
  dashboard.once('ready-to-show', () => dashboard.show());
  dashboard.on('closed', () => {
    if (routerDashboardWindow === dashboard) routerDashboardWindow = null;
  });
  try {
    await dashboard.loadURL(dashboardURL);
    return { ok: true };
  } catch {
    if (!dashboard.isDestroyed()) dashboard.destroy();
    return { ok: false, error: 'Nao foi possivel abrir a configuracao do 9Router.' };
  }
});

function validateMespHistory(
  value: unknown,
): Array<{ role: 'user' | 'assistant'; content: string }> | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_MESP_HISTORY_ITEMS) return null;
  let totalLength = 0;
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    if (item.role !== 'user' && item.role !== 'assistant') return null;
    if (!isString(item.content, MAX_MESP_HISTORY_ITEM_LENGTH)) return null;
    totalLength += item.content.length;
    if (totalLength > MAX_MESP_HISTORY_LENGTH) return null;
    history.push({ role: item.role, content: item.content });
  }
  return history;
}

function validateMespLimits(value: unknown): MespCodeLimits {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const clamp = (candidate: unknown, fallback: number, minimum: number, maximum: number) =>
    typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.max(minimum, Math.min(maximum, Math.floor(candidate)))
      : fallback;
  return {
    maxDurationMs: clamp(
      raw.maxDurationMs,
      MESP_DEFAULT_LIMITS.maxDurationMs,
      30_000,
      30 * 60_000,
    ),
    maxTokens: clamp(raw.maxTokens, MESP_DEFAULT_LIMITS.maxTokens, 1_000, 200_000),
    maxToolCalls: clamp(raw.maxToolCalls, MESP_DEFAULT_LIMITS.maxToolCalls, 1, 500),
  };
}

function configuredMespSecrets(): string[] {
  const environmentSecrets = Object.entries(process.env)
    .filter(
      ([name, secret]) =>
        /(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(name) && typeof secret === 'string' && secret.length >= 8,
    )
    .map(([, secret]) => secret as string);
  const config = readOpenCodeConfig();
  const providerRoot =
    config.provider && typeof config.provider === 'object'
      ? (config.provider as Record<string, unknown>)
      : null;
  const provider =
    providerRoot &&
    providerRoot['9router'] &&
    typeof providerRoot['9router'] === 'object'
      ? (providerRoot['9router'] as Record<string, unknown>)
      : null;
  const options =
    provider && provider.options && typeof provider.options === 'object'
      ? (provider.options as Record<string, unknown>)
      : null;
  const providerSecrets = options
    ? Object.entries(options)
        .filter(([name]) => /(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(name))
        .map(([, secret]) => resolveOpenCodeConfigValue(secret, process.env))
        .filter((secret): secret is string => typeof secret === 'string' && secret.length >= 8)
    : [];
  const activeRouterCredential = configured9RouterOptions(config).apiKey;
  return Array.from(
    new Set([
      ...environmentSecrets,
      ...providerSecrets,
      ...(activeRouterCredential && activeRouterCredential.length >= 8
        ? [activeRouterCredential]
        : []),
    ]),
  );
}

function redactMespSecrets(value: unknown, secrets?: string[]): string {
  let message = value instanceof Error ? value.message : String(value || '');
  for (const secret of secrets ?? configuredMespSecrets()) {
    if (secret.length >= 8) message = message.replaceAll(secret, '[redacted]');
  }
  return message
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
    .replace(
      /\b(api[_ -]?key|authorization|token)(\s*[:=]\s*)[^\s,;"']+/gi,
      '$1$2[redacted]',
    )
    .replace(/\b(?:sk|key)-[A-Za-z0-9._-]{8,}\b/g, '[redacted]');
}

function sanitizeMespError(value: unknown, secrets?: string[]): string {
  return redactMespSecrets(value || 'Erro desconhecido', secrets).slice(0, 2000);
}

function openCodeEventError(event: Record<string, unknown>): string | undefined {
  const error = event.error;
  if (typeof error === 'string' && error.trim()) return error;
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  const data =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : null;
  return data && typeof data.message === 'string' && data.message.trim()
    ? data.message
    : undefined;
}

function safeOpenCodeEvent(
  event: Record<string, unknown>,
  secrets: string[],
): Record<string, unknown> {
  const publicEvent = publicOpenCodeEvent(event);
  if (typeof publicEvent.text === 'string') {
    publicEvent.text = redactMespSecrets(publicEvent.text, secrets);
  }
  const part =
    publicEvent.part && typeof publicEvent.part === 'object'
      ? (publicEvent.part as Record<string, unknown>)
      : null;
  if (part && typeof part.text === 'string') {
    part.text = redactMespSecrets(part.text, secrets);
  }
  return publicEvent;
}

async function runFastMespCode(options: {
  petId: string;
  requestId: string;
  prompt: string;
  model: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  limits: MespCodeLimits;
}): Promise<void> {
  const { petId, requestId, prompt, model, history, limits } = options;
  const runSecrets = configuredMespSecrets();
  const startedAt = Date.now();
  let firstTokenAt: number | null = null;
  let emittedText = false;
  let usage: Record<string, unknown> | undefined;
  let streamError: string | undefined;
  let finished = false;
  const controller = new AbortController();
  const run: MespCodeFetchRun = { requestId, controller, cancelled: false };
  mespCodeFetches.set(petId, run);
  const limitTimer = setTimeout(() => {
    run.limitError = `Limite de tempo atingido (${Math.round(limits.maxDurationMs / 60_000)} min).`;
    controller.abort();
  }, limits.maxDurationMs);
  safeSend('mesp-code:event', {
    petId,
    requestId,
    kind: 'started',
    mode: 'fast',
    engine: '9router',
  });

  const finish = (code: number | null, error?: string) => {
    if (finished) return;
    finished = true;
    clearTimeout(limitTimer);
    if (mespCodeFetches.get(petId) === run) mespCodeFetches.delete(petId);
    const resolvedError =
      run.limitError ||
      error ||
      (!run.cancelled && code === null ? 'A resposta foi interrompida inesperadamente.' : undefined);
    safeSend('mesp-code:event', {
      petId,
      requestId,
      kind: 'exit',
      code,
      error: resolvedError ? sanitizeMespError(resolvedError, runSecrets) : undefined,
      cancelled: run.cancelled,
      engine: '9router',
      durationMs: Date.now() - startedAt,
      firstTokenMs: firstTokenAt == null ? undefined : firstTokenAt - startedAt,
    });
  };

  const emitText = (text: string) => {
    if (!text) return;
    if (firstTokenAt == null) firstTokenAt = Date.now();
    emittedText = true;
    safeSend('mesp-code:event', {
      petId,
      requestId,
      kind: 'text',
      text: redactMespSecrets(text, runSecrets),
    });
  };

  const consumeData = (data: string) => {
    const parsed = parseOpenAIStreamData(data);
    if (parsed.text) emitText(parsed.text);
    if (parsed.usage) usage = parsed.usage;
    if (parsed.error) streamError = parsed.error;
  };

  try {
    const config = readOpenCodeConfig();
    const { baseURL, apiKey } = configured9RouterOptions(config);
    const localRouter = isLoopbackRouterURL(baseURL);
    if (!apiKey && !localRouter) {
      setRouterConnectionStatus(
        'misconfigured',
        'Nenhuma credencial foi configurada para enviar mensagens ao 9Router remoto.',
      );
      throw new Error(
        '9Router remoto sem autenticacao. Configure a credencial e tente novamente.',
      );
    }

    await ensure9RouterRuntime(baseURL);
    const headers = new Headers({ 'content-type': 'application/json' });
    if (apiKey) headers.set('authorization', `Bearer ${apiKey}`);
    const responseSecrets = apiKey ? [...runSecrets, apiKey] : runSecrets;
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelIdFor9Router(model),
        messages: buildFastMessages(history, prompt),
        max_tokens: Math.min(2048, limits.maxTokens),
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        rejectedRouterCredentialHash = routerCredentialHash(apiKey);
        setRouterConnectionStatus(
          'unauthorized',
          'O 9Router recusou a autenticacao. Atualize a credencial configurada e tente novamente.',
        );
      }
      const detail = (await response.text()).slice(0, 1000).trim();
      throw new Error(
        response.status === 401 || response.status === 403
          ? `9Router recusou a autenticacao (${response.status}). Atualize a credencial configurada.`
          : `9Router respondeu ${response.status}${
              detail ? `: ${sanitizeMespError(detail, responseSecrets)}` : ''
            }`,
      );
    }
    rejectedRouterCredentialHash = null;
    setRouterConnectionStatus(
      'ready',
      apiKey
        ? '9Router conectado e autenticacao configurada.'
        : '9Router integrado e pronto para uso local.',
    );
    if (!response.body) throw new Error('9Router retornou uma resposta vazia.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let streamFormat: 'sse' | 'json' | 'unknown' = (
      response.headers.get('content-type') || ''
    ).includes('text/event-stream')
      ? 'sse'
      : 'unknown';
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (streamFormat === 'unknown') {
        const start = buffer.trimStart();
        if (/^(?::|data:|event:|id:|retry:)/.test(start)) streamFormat = 'sse';
        else if (start.startsWith('{') || start.startsWith('[')) streamFormat = 'json';
      }
      if (streamFormat === 'sse') {
        const extracted = extractSSEData(buffer, done);
        buffer = extracted.remainder;
        for (const data of extracted.data) consumeData(data);
      }
      if (done) break;
    }
    if (streamFormat !== 'sse' && buffer.trim()) {
      consumeData(buffer);
    }
    if (streamError) {
      throw new Error(sanitizeMespError(streamError, responseSecrets));
    }

    const total = totalTokensFromUsage(usage);
    if (total !== undefined) {
      safeSend('mesp-code:event', {
        petId,
        requestId,
        kind: 'event',
        event: {
          type: 'step_finish',
          part: {
            type: 'step-finish',
            tokens: {
              total,
              input:
                typeof usage?.prompt_tokens === 'number'
                  ? usage.prompt_tokens
                  : usage?.input_tokens,
              output:
                typeof usage?.completion_tokens === 'number'
                  ? usage.completion_tokens
                  : usage?.output_tokens,
            },
          },
        },
      });
    }
    if (!emittedText) throw new Error('O modelo terminou sem produzir texto.');
    finish(0);
  } catch (error) {
    const aborted = controller.signal.aborted || (error as Error).name === 'AbortError';
    finish(aborted ? null : 1, aborted ? undefined : (error as Error).message);
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function eventSessionId(properties: Record<string, unknown>): string | null {
  if (typeof properties.sessionID === 'string') return properties.sessionID;
  const part = asObject(properties.part);
  if (part && typeof part.sessionID === 'string') return part.sessionID;
  const message = asObject(properties.info) || asObject(properties.message);
  return message && typeof message.sessionID === 'string' ? message.sessionID : null;
}

async function abortMespServerSession(run: MespCodeServerRun): Promise<void> {
  if (!run.sessionId || !mespCodeServer) return;
  try {
    await mespServerFetch(
      mespCodeServer,
      run.cwd,
      `/session/${encodeURIComponent(run.sessionId)}/abort`,
      { method: 'POST' },
    );
  } catch {
    /* best effort */
  }
}

async function runAssistedMespCode(options: {
  petId: string;
  requestId: string;
  prompt: string;
  model: string;
  cwd: string;
  sessionId: string | null;
  limits: MespCodeLimits;
}): Promise<void> {
  const { petId, requestId, prompt, model, cwd, limits } = options;
  const runSecrets = configuredMespSecrets();
  const controller = new AbortController();
  const startedAt = Date.now();
  const deltaParts = new Set<string>();
  const lastPartText = new Map<string, string>();
  const assistantMessageIds = new Set<string>();
  const tokenParts = new Set<string>();
  const toolCalls = new Set<string>();
  let tokenUsage: MespTokenUsage | undefined;
  let firstTokenAt: number | null = null;
  let emittedText = false;
  let finished = false;
  let limitTimer: ReturnType<typeof setTimeout> | null = null;

  const run: MespCodeServerRun = {
    requestId,
    cwd,
    sessionId: options.sessionId,
    controller,
    cancelled: false,
    pendingPermissions: new Set(),
    finish: () => undefined,
  };
  mespCodeServerRuns.set(petId, run);

  const finish = (code: number | null, error?: string) => {
    if (finished) return;
    finished = true;
    if (limitTimer) clearTimeout(limitTimer);
    controller.abort();
    run.pendingPermissions.clear();
    if (mespCodeServerRuns.get(petId) === run) mespCodeServerRuns.delete(petId);
    const rawError =
      run.limitError ||
      error ||
      (!run.cancelled && code === null ? 'O OpenCode foi interrompido inesperadamente.' : undefined);
    safeSend('mesp-code:event', {
      petId,
      requestId,
      kind: 'exit',
      code,
      error: rawError ? sanitizeMespError(rawError, runSecrets) : undefined,
      cancelled: run.cancelled,
      sessionInvalid: /session not found|404.+session/i.test(rawError || ''),
      sessionId: run.sessionId,
      engine: 'opencode-server',
      durationMs: Date.now() - startedAt,
      firstTokenMs: firstTokenAt == null ? undefined : firstTokenAt - startedAt,
    });
  };
  run.finish = finish;

  const stopAtLimit = (message: string) => {
    if (finished || run.cancelled || run.limitError) return;
    run.limitError = message;
    void abortMespServerSession(run);
    finish(null, message);
  };
  limitTimer = setTimeout(
    () =>
      stopAtLimit(
        `Limite de tempo atingido (${Math.round(limits.maxDurationMs / 60_000)} min).`,
      ),
    limits.maxDurationMs,
  );

  const emitText = (text: string) => {
    if (!text || finished) return;
    if (firstTokenAt == null) firstTokenAt = Date.now();
    emittedText = true;
    safeSend('mesp-code:event', {
      petId,
      requestId,
      kind: 'text',
      text: redactMespSecrets(text, runSecrets),
    });
  };

  const emitPartEvent = (type: string, part: Record<string, unknown>) => {
    safeSend('mesp-code:event', {
      petId,
      requestId,
      kind: 'event',
      event: safeOpenCodeEvent({ type, sessionID: run.sessionId, part }, runSecrets),
    });
  };

  const consumeEvent = (envelope: Record<string, unknown>) => {
    const type = typeof envelope.type === 'string' ? envelope.type : '';
    const properties = asObject(envelope.properties) || {};
    if (eventSessionId(properties) !== run.sessionId || finished) return;

    if (type === 'message.part.delta') {
      const partId = typeof properties.partID === 'string' ? properties.partID : '';
      const messageId = typeof properties.messageID === 'string' ? properties.messageID : '';
      if (!messageId || !assistantMessageIds.has(messageId)) return;
      if (properties.field === 'text' && typeof properties.delta === 'string') {
        if (partId) deltaParts.add(partId);
        emitText(properties.delta);
      }
      return;
    }

    if (type === 'message.part.updated') {
      const part = asObject(properties.part);
      if (!part) return;
      const partId = typeof part.id === 'string' ? part.id : '';
      const partType = typeof part.type === 'string' ? part.type : '';
      const messageId = typeof part.messageID === 'string' ? part.messageID : '';
      if (!messageId || !assistantMessageIds.has(messageId)) return;
      if (partType === 'text' && typeof part.text === 'string' && !deltaParts.has(partId)) {
        const previous = lastPartText.get(partId) || '';
        const next = part.text;
        if (next.startsWith(previous)) emitText(next.slice(previous.length));
        else if (!previous) emitText(next);
        lastPartText.set(partId, next);
      }
      if (partType === 'tool') {
        const callId =
          (typeof part.callID === 'string' && part.callID) ||
          (typeof part.id === 'string' && part.id) ||
          '';
        if (callId && !toolCalls.has(callId)) {
          toolCalls.add(callId);
          if (toolCalls.size > limits.maxToolCalls) {
            stopAtLimit(`Limite de ferramentas atingido (${limits.maxToolCalls}).`);
            return;
          }
        }
        emitPartEvent('tool_use', part);
      }
      if (partType === 'step-finish') {
        if (!partId || !tokenParts.has(partId)) {
          if (partId) tokenParts.add(partId);
          tokenUsage = addTokenUsage(tokenUsage, tokenUsageFromOpenCodeEvent({ part }));
          emitPartEvent('step_finish', part);
          if (tokenUsage && tokenUsage.total > limits.maxTokens) {
            stopAtLimit(`Limite de tokens atingido (${limits.maxTokens.toLocaleString()}).`);
          }
        }
      }
      return;
    }

    if (type === 'message.updated') {
      const info = asObject(properties.info) || asObject(properties.message);
      if (
        info &&
        typeof info.id === 'string' &&
        (info.role === 'user' || info.role === 'assistant')
      ) {
        if (info.role === 'assistant') assistantMessageIds.add(info.id);
        safeSend('mesp-code:event', {
          petId,
          requestId,
          kind: 'event',
          event: {
            type: 'message_updated',
            sessionID: run.sessionId,
            message: { id: info.id, role: info.role },
          },
        });
      }
      return;
    }

    if (type === 'permission.asked' || type === 'permission.v2.asked') {
      const permissionId = typeof properties.id === 'string' ? properties.id : '';
      if (!permissionId) return;
      run.pendingPermissions.add(permissionId);
      const patterns = Array.isArray(properties.patterns)
        ? properties.patterns.filter((item): item is string => typeof item === 'string').slice(0, 20)
        : [];
      safeSend('mesp-code:event', {
        petId,
        requestId,
        kind: 'permission',
        permission: {
          id: permissionId,
          action:
            typeof properties.permission === 'string' ? properties.permission.slice(0, 100) : 'acao',
          resources: patterns.map((item) => redactMespSecrets(item, runSecrets).slice(0, 1000)),
          remember: Array.isArray(properties.always)
            ? properties.always
                .filter((item): item is string => typeof item === 'string')
                .slice(0, 20)
                .map((item) => redactMespSecrets(item, runSecrets).slice(0, 1000))
            : [],
          tool: typeof properties.tool === 'string' ? properties.tool.slice(0, 100) : undefined,
        },
      });
      return;
    }

    if (type === 'session.error') {
      const error = asObject(properties.error);
      const message = openCodeEventError({ error }) || 'O OpenCode encontrou um erro na sessao.';
      noteRouterAuthenticationError(message);
      finish(1, message);
      return;
    }
    if (type === 'session.idle') {
      finish(emittedText ? 0 : 1, emittedText ? undefined : 'O modelo terminou sem produzir texto.');
    }
  };

  safeSend('mesp-code:event', {
    petId,
    requestId,
    kind: 'started',
    mode: 'assisted',
    engine: 'opencode-server',
  });

  try {
    const server = await ensureMespCodeServer();
    if (finished) return;
    if (!run.sessionId) {
      const created = await mespServerJson<{ id?: unknown }>(server, cwd, '/session', {
        method: 'POST',
        body: JSON.stringify({
          title: 'MESP Code Assistido',
          agent: 'mesp-assisted',
          permission: MESP_ASSISTED_PERMISSION_RULES,
        }),
        signal: controller.signal,
      });
      if (typeof created.id !== 'string') throw new Error('O OpenCode criou uma sessao invalida.');
      run.sessionId = created.id;
      safeSend('mesp-code:event', {
        petId,
        requestId,
        kind: 'event',
        event: { type: 'session_created', sessionID: run.sessionId },
      });
    }

    const eventResponse = await mespServerFetch(server, cwd, '/event', {
      signal: controller.signal,
    });
    if (!eventResponse.ok || !eventResponse.body) {
      throw new Error(`Nao foi possivel acompanhar a sessao (${eventResponse.status}).`);
    }
    const promptResponse = await mespServerFetch(
      server,
      cwd,
      `/session/${encodeURIComponent(run.sessionId)}/prompt_async`,
      {
        method: 'POST',
        body: JSON.stringify({
          model: { providerID: '9router', modelID: modelIdFor9Router(model) },
          agent: 'mesp-assisted',
          parts: [{ type: 'text', text: prompt }],
        }),
        signal: controller.signal,
      },
    );
    if (!promptResponse.ok) {
      throw new Error(`OpenCode respondeu ${promptResponse.status} ao iniciar a tarefa.`);
    }

    const reader = eventResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!finished) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const extracted = extractSSEData(buffer, done);
      buffer = extracted.remainder;
      for (const data of extracted.data) {
        if (data === '[DONE]') continue;
        try {
          consumeEvent(JSON.parse(data) as Record<string, unknown>);
        } catch {
          // Ignora apenas eventos SSE individuais malformados.
        }
      }
      if (done) break;
    }
    if (!finished) finish(null, 'A conexao de eventos do OpenCode foi encerrada.');
  } catch (error) {
    if (finished) return;
    const aborted = controller.signal.aborted || (error as Error).name === 'AbortError';
    finish(aborted ? null : 1, aborted ? undefined : (error as Error).message);
  }
}

ipcMain.handle('mesp-code:send', async (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') {
    return { ok: false, error: 'payload invalido' };
  }
  const payload = payloadRaw as Record<string, unknown>;
  const petId = validatePetId(payload.petId);
  if (!petId) return { ok: false, error: 'petId invalido' };
  const requestId = validateRunId(payload.requestId);
  if (!requestId) return { ok: false, error: 'requestId invalido' };
  if (
    mespCodeProcesses.has(petId) ||
    mespCodeFetches.has(petId) ||
    mespCodeServerRuns.has(petId) ||
    projectCheckRuns.has(petId)
  ) {
    return { ok: false, error: 'o MESP ainda esta respondendo' };
  }

  const prompt = isString(payload.prompt, MAX_MESP_PROMPT_LENGTH) ? payload.prompt.trim() : '';
  if (!prompt) return { ok: false, error: 'mensagem vazia' };
  const model =
    isString(payload.model, 256) && MODEL_PATTERN.test(payload.model) ? payload.model : null;
  if (!model) return { ok: false, error: 'modelo invalido' };
  const mode: MespCodeMode | null = isMespCodeMode(payload.mode) ? payload.mode : null;
  if (!mode) return { ok: false, error: 'modo invalido' };
  const history = validateMespHistory(payload.history);
  if (!history) return { ok: false, error: 'historico invalido' };
  const limits = validateMespLimits(payload.limits);
  const sessionId = payload.sessionId == null ? null : validateRunId(payload.sessionId);
  if (payload.sessionId != null && !sessionId) {
    return { ok: false, error: 'sessao invalida' };
  }

  const { baseURL } = configured9RouterOptions(readOpenCodeConfig());
  const routerRuntime = await ensure9RouterRuntime(baseURL);
  if (routerRuntime === 'unavailable') {
    return { ok: false, error: 'o 9Router nao esta disponivel' };
  }

  if (mode === 'fast') {
    void runFastMespCode({ petId, requestId, prompt, model, history, limits });
    return { ok: true };
  }

  const requestedCwd = isString(payload.cwd, 4096) ? payload.cwd : null;
  const cwd =
    requestedCwd && fs.existsSync(requestedCwd) && fs.statSync(requestedCwd).isDirectory()
      ? requestedCwd
      : process.cwd();
  if (mode === 'assisted') {
    void runAssistedMespCode({ petId, requestId, prompt, model, cwd, sessionId, limits });
    return { ok: true };
  }
  const args = buildOpenCodeArgs({ prompt, model, sessionId, mode });
  const runSecrets = configuredMespSecrets();

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(resolveOpenCodeBinary(), args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        NO_COLOR: '1',
        OPENCODE_CONFIG: mespOpenCodeConfigPath(),
        OPENCODE_DISABLE_AUTOUPDATE: '1',
        OPENCODE_CONFIG_CONTENT: JSON.stringify(MESP_AGENT_CONFIG),
      },
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const run: MespCodeProcessRun = { requestId, child, cancelled: false };
  mespCodeProcesses.set(petId, run);
  const startedAt = Date.now();
  let firstTokenAt: number | null = null;
  safeSend('mesp-code:event', { petId, requestId, kind: 'started', mode, engine: 'opencode' });
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let finished = false;
  let structuredError = '';
  let lastOutputAt = Date.now();
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let limitTimer: ReturnType<typeof setTimeout> | null = null;
  let tokenUsage: MespTokenUsage | undefined;
  const tokenParts = new Set<string>();
  const toolCalls = new Set<string>();

  const stopAtLimit = (message: string) => {
    if (run.limitError || run.cancelled || finished) return;
    run.limitError = message;
    try {
      child.kill();
    } catch {
      /* noop */
    }
  };

  const emitJsonLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      if (event.type === 'error') {
        structuredError = openCodeEventError(event) || structuredError;
        noteRouterAuthenticationError(structuredError);
      }
      const part =
        event.part && typeof event.part === 'object'
          ? (event.part as Record<string, unknown>)
          : null;
      const partType = part && typeof part.type === 'string' ? part.type : '';
      if (partType === 'step-finish') {
        const partId = part && typeof part.id === 'string' ? part.id : '';
        if (!partId || !tokenParts.has(partId)) {
          if (partId) tokenParts.add(partId);
          tokenUsage = addTokenUsage(tokenUsage, tokenUsageFromOpenCodeEvent(event));
          if (tokenUsage && tokenUsage.total > limits.maxTokens) {
            stopAtLimit(`Limite de tokens atingido (${limits.maxTokens.toLocaleString()}).`);
          }
        }
      }
      if (partType === 'tool' || (typeof event.type === 'string' && event.type.includes('tool'))) {
        const callId =
          (part && typeof part.callID === 'string' && part.callID) ||
          (part && typeof part.id === 'string' && part.id) ||
          '';
        if (callId && !toolCalls.has(callId)) {
          toolCalls.add(callId);
          if (toolCalls.size > limits.maxToolCalls) {
            stopAtLimit(`Limite de ferramentas atingido (${limits.maxToolCalls}).`);
          }
        }
      }
      if (
        firstTokenAt == null &&
        ((event.type === 'text' && typeof event.text === 'string' && event.text) ||
          (part?.type === 'text' && typeof part.text === 'string' && part.text))
      ) {
        firstTokenAt = Date.now();
      }
      safeSend('mesp-code:event', {
        petId,
        requestId,
        kind: 'event',
        event: safeOpenCodeEvent(event, runSecrets),
      });
    } catch {
      if (firstTokenAt == null) firstTokenAt = Date.now();
      safeSend('mesp-code:event', {
        petId,
        requestId,
        kind: 'text',
        text: `${sanitizeMespError(trimmed, runSecrets)}\n`,
      });
    }
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    lastOutputAt = Date.now();
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) emitJsonLine(line);
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    lastOutputAt = Date.now();
    stderrBuffer = (stderrBuffer + chunk).slice(-16_000);
  });

  const finish = (code: number | null, error?: string) => {
    if (finished) return;
    finished = true;
    if (watchdog) clearInterval(watchdog);
    if (limitTimer) clearTimeout(limitTimer);
    if (stdoutBuffer.trim()) emitJsonLine(stdoutBuffer);
    if (mespCodeProcesses.get(petId) === run) mespCodeProcesses.delete(petId);
    const rawError =
      run.limitError ||
      error ||
      (code && (structuredError || stderrBuffer.trim())) ||
      (!run.cancelled && code === null ? 'O OpenCode foi interrompido inesperadamente.' : undefined);
    if (rawError) noteRouterAuthenticationError(rawError);
    const safeError = rawError ? sanitizeMespError(rawError, runSecrets) : undefined;
    safeSend('mesp-code:event', {
      petId,
      requestId,
      kind: 'exit',
      code,
      error: safeError,
      cancelled: run.cancelled,
      sessionInvalid: /session not found/i.test(`${structuredError}\n${stderrBuffer}`),
      engine: 'opencode',
      durationMs: Date.now() - startedAt,
      firstTokenMs: firstTokenAt == null ? undefined : firstTokenAt - startedAt,
    });
  };
  child.on('error', (err) => finish(null, err.message));
  child.on('close', (code) => finish(code));

  // `opencode run` espera EOF quando o stdin e um pipe. Sem fechar o stream,
  // o processo fica parado no bootstrap e o chat permanece pensando para sempre.
  child.stdin.on('error', () => {
    /* EPIPE se o processo encerrar muito cedo. */
  });
  child.stdin.end();

  limitTimer = setTimeout(() => {
    stopAtLimit(`Limite de tempo atingido (${Math.round(limits.maxDurationMs / 60_000)} min).`);
  }, limits.maxDurationMs);

  watchdog = setInterval(() => {
    if (Date.now() - lastOutputAt < 180_000) return;
    try {
      child.kill();
    } catch {
      /* noop */
    }
    finish(null, 'O OpenCode nao respondeu por 3 minutos. Tente novamente.');
  }, 15_000);
  return { ok: true };
});

ipcMain.handle('mesp-code:permission-reply', async (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') return { ok: false, error: 'payload invalido' };
  const payload = payloadRaw as Record<string, unknown>;
  const petId = validatePetId(payload.petId);
  const requestId = validateRunId(payload.requestId);
  const permissionId = validateRunId(payload.permissionId);
  const reply =
    payload.reply === 'once' || payload.reply === 'always' || payload.reply === 'reject'
      ? payload.reply
      : null;
  if (!petId || !requestId || !permissionId || !reply) {
    return { ok: false, error: 'resposta de permissao invalida' };
  }
  const run = mespCodeServerRuns.get(petId);
  if (!run || run.requestId !== requestId || !run.pendingPermissions.has(permissionId)) {
    return { ok: false, error: 'a permissao nao esta mais pendente' };
  }
  try {
    const server = await ensureMespCodeServer();
    const response = await mespServerFetch(
      server,
      run.cwd,
      `/permission/${encodeURIComponent(permissionId)}/reply`,
      { method: 'POST', body: JSON.stringify({ reply }) },
    );
    if (!response.ok) throw new Error(`OpenCode respondeu ${response.status}.`);
    run.pendingPermissions.delete(permissionId);
    safeSend('mesp-code:event', {
      petId,
      requestId,
      kind: 'event',
      event: { type: 'permission_replied', permissionID: permissionId, reply },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: sanitizeMespError(error) };
  }
});

function resolveNpmRunner(): {
  command: string;
  args: string[];
  source: InstalledRuntimeSource;
  npmCli?: string;
} | null {
  const bundledNode = resolveBundledNodeBinary();
  const bundledNpm = resolveBundledNpmCli();
  if (bundledNode && bundledNpm) {
    return {
      command: bundledNode,
      args: [bundledNpm],
      source: 'bundled',
      npmCli: bundledNpm,
    };
  }
  if (process.platform !== 'win32') {
    const npmCommand = commandOnPath('npm');
    return npmCommand ? { command: npmCommand, args: [], source: 'system' } : null;
  }
  const pathEntries = (process.env.PATH || process.env.Path || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const cliCandidates = [
    process.env.npm_execpath,
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : null,
    ...pathEntries.map((entry) => path.join(entry, 'node_modules', 'npm', 'bin', 'npm-cli.js')),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const npmCli = cliCandidates.find(
    (candidate) => path.basename(candidate).toLowerCase() === 'npm-cli.js' && fs.existsSync(candidate),
  );
  const nodeCandidates = [
    process.env.npm_node_execpath,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : null,
    ...pathEntries.map((entry) => path.join(entry, 'node.exe')),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const nodeBinary = nodeCandidates.find(
    (candidate) =>
      path.basename(candidate).toLowerCase() === 'node.exe' && fs.existsSync(candidate),
  );
  return npmCli && nodeBinary
    ? { command: nodeBinary, args: [npmCli], source: 'system', npmCli }
    : null;
}

function ensureBundledRuntimeBin(npmRunner: ReturnType<typeof resolveNpmRunner>): string | null {
  if (!npmRunner || npmRunner.source !== 'bundled' || !npmRunner.npmCli) return null;
  try {
    const runtimeBin = path.join(app.getPath('userData'), 'runtime-bin');
    fs.mkdirSync(runtimeBin, { recursive: true });
    const npxCli = path.join(path.dirname(npmRunner.npmCli), 'npx-cli.js');
    if (process.platform === 'win32') {
      const commands: Array<[string, string]> = [
        ['npm.cmd', npmRunner.npmCli],
        ['npx.cmd', npxCli],
      ];
      for (const [name, cliPath] of commands) {
        const target = path.join(runtimeBin, name);
        const contents = `@ECHO OFF\r\n"${npmRunner.command}" "${cliPath}" %*\r\n`;
        if (!isExistingFile(target) || fs.readFileSync(target, 'utf8') !== contents) {
          fs.writeFileSync(target, contents, 'utf8');
        }
      }
    } else {
      const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;
      const commands: Array<[string, string]> = [
        ['npm', npmRunner.npmCli],
        ['npx', npxCli],
      ];
      for (const [name, cliPath] of commands) {
        const target = path.join(runtimeBin, name);
        const contents = `#!/bin/sh\nexec ${quote(npmRunner.command)} ${quote(cliPath)} "$@"\n`;
        if (!isExistingFile(target) || fs.readFileSync(target, 'utf8') !== contents) {
          fs.writeFileSync(target, contents, { encoding: 'utf8', mode: 0o700 });
        }
        fs.chmodSync(target, 0o700);
      }
    }
    return runtimeBin;
  } catch {
    return null;
  }
}

function projectCheckEnvironment(
  npmRunner: ReturnType<typeof resolveNpmRunner>,
): NodeJS.ProcessEnv {
  const allowed = new Set([
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'ComSpec',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'LANG',
  ]);
  const env: NodeJS.ProcessEnv = { CI: '1', NO_COLOR: '1' };
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && (allowed.has(name) || name.startsWith('LC_'))) env[name] = value;
  }
  if (npmRunner?.source === 'bundled') {
    const runtimeBin = ensureBundledRuntimeBin(npmRunner);
    const currentPath = env.PATH || env.Path || '';
    const pathParts = [runtimeBin, path.dirname(npmRunner.command), currentPath].filter(Boolean);
    env.PATH = pathParts.join(path.delimiter);
    if (process.platform === 'win32') env.Path = env.PATH;
    env.npm_node_execpath = npmRunner.command;
    if (npmRunner.npmCli) env.npm_execpath = npmRunner.npmCli;
  }
  return env;
}

function waitForProjectCheckClose(
  child: ChildProcessWithoutNullStreams,
  timeoutMs = 5_000,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('close', finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once('close', finish);
  });
}

async function terminateProjectCheckProcess(
  child: ChildProcessWithoutNullStreams | null,
): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null || child.pid == null) return;
  const closed = waitForProjectCheckClose(child);
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve();
      };
      try {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
        });
        timer = setTimeout(finish, 5_000);
        killer.once('error', finish);
        killer.once('close', finish);
      } catch {
        finish();
      }
    });
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      /* noop */
    }
  }
  await closed;
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* noop */
    }
    await waitForProjectCheckClose(child, 2_000);
  }
}

function terminateProjectCheckRun(run: ProjectCheckRun): Promise<void> {
  if (run.termination) return run.termination;
  const child = run.child;
  if (!child) return Promise.resolve();
  run.termination = terminateProjectCheckProcess(child).finally(() => {
    if (run.child === child) run.child = null;
    run.termination = null;
  });
  return run.termination;
}

function terminateProjectCheckProcessOnShutdown(
  child: ChildProcessWithoutNullStreams | null,
): void {
  if (!child || child.exitCode !== null || child.signalCode !== null || child.pid == null) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5_000,
      });
      return;
    } catch {
      /* fallback below */
    }
  }
  try {
    child.kill('SIGKILL');
  } catch {
    /* noop */
  }
}

function availableProjectChecks(cwd: string): ProjectCheckName[] {
  const packagePath = path.join(cwd, 'package.json');
  try {
    const stat = fs.lstatSync(packagePath);
    if (stat.isSymbolicLink()) return [];
    if (!stat.isFile() || stat.size > MAX_PROJECT_PACKAGE_JSON_BYTES) return [];
    return discoverProjectChecks(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    return [];
  }
}

ipcMain.handle('mesp-code:get-project-checks', (_evt, cwdRaw: unknown) => {
  const requestedCwd = isString(cwdRaw, 4096) ? cwdRaw : null;
  if (!requestedCwd) return { ok: false, checks: [], error: 'diretorio invalido' };
  let cwd: string;
  try {
    cwd = fs.realpathSync(requestedCwd);
    if (!fs.statSync(cwd).isDirectory()) {
      return { ok: false, checks: [], error: 'diretorio invalido' };
    }
  } catch {
    return { ok: false, checks: [], error: 'diretorio invalido' };
  }
  return { ok: true, checks: availableProjectChecks(cwd) };
});

ipcMain.handle('mesp-code:verify', async (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') {
    return { ok: false, error: 'payload invalido' };
  }
  const payload = payloadRaw as Record<string, unknown>;
  const petId = validatePetId(payload.petId);
  const verificationId = validateRunId(payload.verificationId);
  const messageId = validateRunId(payload.messageId);
  const requestedCwd = isString(payload.cwd, 4096) ? payload.cwd : null;
  if (!petId || !verificationId || !messageId || !requestedCwd) {
    return { ok: false, error: 'verificacao invalida' };
  }
  let cwd: string;
  try {
    cwd = fs.realpathSync(requestedCwd);
    if (!fs.statSync(cwd).isDirectory()) return { ok: false, error: 'diretorio invalido' };
  } catch {
    return { ok: false, error: 'diretorio invalido' };
  }
  const checks = normalizeProjectChecks(payload.checks, availableProjectChecks(cwd));
  if (!checks) return { ok: false, error: 'script de verificacao invalido' };
  if (projectCheckRuns.has(petId)) {
    return { ok: false, error: 'uma verificacao ainda esta em andamento' };
  }
  if (projectCheckRuns.size >= MAX_PROJECT_CHECK_RUNS) {
    return { ok: false, error: 'limite global de verificacoes atingido' };
  }
  if (
    mespCodeProcesses.has(petId) ||
    mespCodeFetches.has(petId) ||
    mespCodeServerRuns.has(petId)
  ) {
    return { ok: false, error: 'o MESP ainda esta respondendo' };
  }
  const npmRunner = resolveNpmRunner();
  if (!npmRunner) return { ok: false, error: 'npm nao foi encontrado' };

  const run: ProjectCheckRun = {
    verificationId,
    child: null,
    stopReason: null,
    termination: null,
  };
  const secrets = configuredMespSecrets();
  const results: Array<{
    check: ProjectCheckName;
    code: number | null;
    durationMs: number;
    timedOut: boolean;
    truncated: boolean;
  }> = [];
  projectCheckRuns.set(petId, run);
  const suiteTimer = setTimeout(() => {
    if (run.stopReason) return;
    run.stopReason = 'suite-timeout';
    void terminateProjectCheckRun(run);
  }, MAX_PROJECT_CHECK_SUITE_DURATION_MS);
  safeSend('mesp-code:verify-event', {
    petId,
    verificationId,
    messageId,
    kind: 'started',
    checks,
  });

  try {
    for (const check of checks) {
      if (run.stopReason) break;
      const startedAt = Date.now();
      safeSend('mesp-code:verify-event', {
        petId,
        verificationId,
        messageId,
        kind: 'check-started',
        check,
      });
      const result = await new Promise<{
        code: number | null;
        timedOut: boolean;
        truncated: boolean;
      }>((resolve) => {
        let child: ChildProcessWithoutNullStreams;
        let settled = false;
        let timedOut = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const output = createBoundedProjectCheckOutput(MAX_PROJECT_CHECK_OUTPUT);
        const emitBufferedOutput = (stream: 'stdout' | 'stderr', raw: string) => {
          const text = redactMespSecrets(raw, secrets);
          if (!text) return;
          for (let offset = 0; offset < text.length; offset += 16_000) {
            safeSend('mesp-code:verify-event', {
              petId,
              verificationId,
              messageId,
              kind: 'check-output',
              check,
              stream,
              text: text.slice(offset, offset + 16_000),
            });
          }
        };
        const finish = (code: number | null) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          const buffered = output.snapshot();
          emitBufferedOutput('stdout', buffered.stdout);
          emitBufferedOutput('stderr', buffered.stderr);
          if (run.child === child) run.child = null;
          resolve({
            code,
            timedOut: timedOut || run.stopReason === 'suite-timeout',
            truncated: buffered.truncated,
          });
        };
        try {
          child = spawn(npmRunner.command, [...npmRunner.args, 'run', '--ignore-scripts', check], {
            cwd,
            shell: false,
            windowsHide: true,
            env: projectCheckEnvironment(npmRunner),
          });
          run.child = child;
          run.termination = null;
        } catch {
          resolve({ code: null, timedOut: false, truncated: false });
          return;
        }
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          output.append('stdout', chunk);
        });
        child.stderr.on('data', (chunk: string) => {
          output.append('stderr', chunk);
        });
        child.on('error', () => finish(null));
        child.on('close', (code) => finish(code));
        timer = setTimeout(() => {
          timedOut = true;
          if (!run.stopReason) run.stopReason = 'suite-timeout';
          void terminateProjectCheckRun(run).finally(() => finish(child.exitCode));
        }, MAX_PROJECT_CHECK_DURATION_MS);
      });
      const item = { check, ...result, durationMs: Date.now() - startedAt };
      results.push(item);
      safeSend('mesp-code:verify-event', {
        petId,
        verificationId,
        messageId,
        kind: 'check-exit',
        cancelled: run.stopReason === 'cancelled',
        ...item,
      });
      if (result.code !== 0) break;
    }
  } finally {
    clearTimeout(suiteTimer);
    await terminateProjectCheckRun(run);
    if (projectCheckRuns.get(petId) === run) projectCheckRuns.delete(petId);
  }
  const finalState = projectCheckFinalState({
    cancelled: run.stopReason === 'cancelled',
    stopped: run.stopReason !== null,
    results,
    expectedCount: checks.length,
  });
  const { passed, cancelled } = finalState;
  safeSend('mesp-code:verify-event', {
    petId,
    verificationId,
    messageId,
    kind: 'exit',
    passed,
    cancelled,
    results,
  });
  return { ok: true, passed, cancelled, results };
});

ipcMain.handle('mesp-code:verify-cancel', async (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') return false;
  const payload = payloadRaw as Record<string, unknown>;
  const petId = validatePetId(payload.petId);
  const verificationId = validateRunId(payload.verificationId);
  if (!petId || !verificationId) return false;
  const run = projectCheckRuns.get(petId);
  if (!run || run.verificationId !== verificationId) return false;
  run.stopReason = 'cancelled';
  await terminateProjectCheckRun(run);
  return true;
});

ipcMain.handle('mesp-code:get-diff', async (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') {
    return { ok: false, error: 'payload invalido' };
  }
  const payload = payloadRaw as Record<string, unknown>;
  const sessionId = validateRunId(payload.sessionId);
  const messageId = payload.messageId == null ? null : validateRunId(payload.messageId);
  const requestedCwd = isString(payload.cwd, 4096) ? payload.cwd : null;
  if (!sessionId || !requestedCwd || (payload.messageId != null && !messageId)) {
    return { ok: false, error: 'sessao invalida' };
  }
  let cwd: string;
  try {
    cwd = fs.existsSync(requestedCwd) && fs.statSync(requestedCwd).isDirectory()
      ? requestedCwd
      : '';
  } catch {
    cwd = '';
  }
  if (!cwd) return { ok: false, error: 'diretorio invalido' };
  try {
    const server = await ensureMespCodeServer();
    const raw = await mespServerJson<unknown>(
      server,
      cwd,
      `/session/${encodeURIComponent(sessionId)}/diff${
        messageId ? `?messageID=${encodeURIComponent(messageId)}` : ''
      }`,
    );
    if (!Array.isArray(raw)) throw new Error('O OpenCode retornou um diff invalido.');
    const secrets = configuredMespSecrets();
    let totalLength = 0;
    const files: Array<{
      file: string;
      patch: string;
      additions: number;
      deletions: number;
      status: string;
    }> = [];
    for (const itemRaw of raw.slice(0, MAX_MESP_DIFF_FILES)) {
      const item = asObject(itemRaw);
      if (!item || typeof item.file !== 'string') continue;
      const remaining = MAX_MESP_DIFF_TOTAL_LENGTH - totalLength;
      if (remaining <= 0) break;
      const patch = redactMespSecrets(
        typeof item.patch === 'string'
          ? item.patch.slice(0, Math.min(MAX_MESP_DIFF_PATCH_LENGTH, remaining))
          : '',
        secrets,
      );
      totalLength += patch.length;
      files.push({
        file: redactMespSecrets(item.file, secrets).slice(0, 4096),
        patch,
        additions: isFiniteNumber(item.additions) ? Math.max(0, Math.floor(item.additions)) : 0,
        deletions: isFiniteNumber(item.deletions) ? Math.max(0, Math.floor(item.deletions)) : 0,
        status: typeof item.status === 'string' ? item.status.slice(0, 40) : 'modified',
      });
    }
    return { ok: true, files, truncated: raw.length > files.length || totalLength >= MAX_MESP_DIFF_TOTAL_LENGTH };
  } catch (error) {
    return { ok: false, error: sanitizeMespError(error) };
  }
});

ipcMain.handle('mesp-code:revert', async (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') {
    return { ok: false, error: 'payload invalido' };
  }
  const payload = payloadRaw as Record<string, unknown>;
  const sessionId = validateRunId(payload.sessionId);
  const messageId = validateRunId(payload.messageId);
  const requestedCwd = isString(payload.cwd, 4096) ? payload.cwd : null;
  if (!sessionId || !messageId || !requestedCwd) {
    return { ok: false, error: 'dados de reversao invalidos' };
  }
  let cwd = '';
  try {
    if (fs.existsSync(requestedCwd) && fs.statSync(requestedCwd).isDirectory()) cwd = requestedCwd;
  } catch {
    /* handled below */
  }
  if (!cwd) return { ok: false, error: 'diretorio invalido' };
  try {
    const server = await ensureMespCodeServer();
    const response = await mespServerFetch(
      server,
      cwd,
      `/session/${encodeURIComponent(sessionId)}/revert`,
      { method: 'POST', body: JSON.stringify({ messageID: messageId }) },
    );
    if (!response.ok) throw new Error(`OpenCode respondeu ${response.status} ao reverter.`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: sanitizeMespError(error) };
  }
});

ipcMain.handle('mesp-code:cancel', (_evt, petIdRaw: unknown) => {
  if (!petIdRaw || typeof petIdRaw !== 'object') return false;
  const payload = petIdRaw as Record<string, unknown>;
  const petId = validatePetId(payload.petId);
  const requestId = validateRunId(payload.requestId);
  if (!petId) return false;
  if (!requestId) return false;
  const processRun = mespCodeProcesses.get(petId);
  const fetchRun = mespCodeFetches.get(petId);
  const serverRun = mespCodeServerRuns.get(petId);
  const matchingProcess = processRun?.requestId === requestId ? processRun : null;
  const matchingFetch = fetchRun?.requestId === requestId ? fetchRun : null;
  const matchingServer = serverRun?.requestId === requestId ? serverRun : null;
  if (matchingFetch) {
    matchingFetch.cancelled = true;
    matchingFetch.controller.abort();
  }
  if (matchingProcess) {
    matchingProcess.cancelled = true;
    try {
      matchingProcess.child.kill();
    } catch {
      return matchingFetch != null;
    }
  }
  if (matchingServer) {
    matchingServer.cancelled = true;
    void abortMespServerSession(matchingServer);
    matchingServer.controller.abort();
    matchingServer.finish(null);
  }
  return matchingProcess != null || matchingFetch != null || matchingServer != null;
});

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
      try {
        child.kill();
      } catch {
        /* noop */
      }
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
  const body = typeof payload.body === 'string' && payload.body.length <= 1000 ? payload.body : '';
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

ipcMain.handle('kiro:run', async (event, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') {
    return makeRunError('payload inválido');
  }
  const payload = payloadRaw as Record<string, unknown>;
  const runId = validateRunId(payload.runId);
  if (!runId) return makeRunError('runId inválido');

  if (runningProcesses.size >= MAX_RUNNING_PROCESSES) {
    return makeRunError(
      `limite de ${MAX_RUNNING_PROCESSES} processos concorrentes atingido`,
      runId,
    );
  }
  if (runningProcesses.has(runId)) {
    return makeRunError('runId em uso', runId);
  }

  const cmdRaw = payload.command;
  const cmd =
    validateCommand(cmdRaw) ?? validateCommand(process.env.KIRO_COMMAND ?? null) ?? 'kiro';

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
});

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
    try {
      existing.kill();
    } catch {
      /* noop */
    }
    terminalProcesses.delete(petId);
  }

  // Cap global de PTYs simultâneos.
  if (terminalProcesses.size >= MAX_TERMINAL_PROCESSES) {
    return { ok: false, error: `limite de ${MAX_TERMINAL_PROCESSES} terminais atingido` };
  }

  const cmd =
    validateCommand(payload.command) ??
    validateCommand(process.env.KIRO_COMMAND ?? null) ??
    '9code';

  const argsInput = payload.args;
  let args: string[];
  if (argsInput === undefined || argsInput === null) {
    args = (process.env.KIRO_TASK_PREFIX || '').split(' ').filter(Boolean);
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
  try {
    ptyProcess.kill();
  } catch {
    /* noop */
  }
  terminalProcesses.delete(petId);
  return true;
});

// Sem menu nativo; o pet tem seu próprio menu via context menu HTML.
// ----- Contexto de projeto: regras (AGENTS.md/CLAUDE.md/...) e git ----------

const RULES_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  'GEMINI.md',
  '.windsurfrules',
  '.github/copilot-instructions.md',
];
const MAX_RULES_BYTES = 200_000;

interface GitStatusResult {
  branch: string;
  changed: number;
  files: string[];
}

// Garante que `target` esta dentro de `dir` (defesa contra path traversal).
function isInside(dir: string, target: string): boolean {
  const rel = path.relative(dir, target);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

ipcMain.handle('project:read-rules', (_evt, workDirRaw: unknown) => {
  const workDir = isString(workDirRaw, 4096) ? workDirRaw : null;
  if (!workDir) return [] as Array<{ name: string; content: string }>;
  const results: Array<{ name: string; content: string }> = [];
  for (const name of RULES_FILES) {
    const full = path.join(workDir, name);
    if (!isInside(workDir, full)) continue;
    try {
      if (!fs.existsSync(full)) continue;
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > MAX_RULES_BYTES) continue;
      results.push({ name, content: fs.readFileSync(full, 'utf-8') });
    } catch {
      /* ignora arquivo ilegivel */
    }
  }
  return results;
});

ipcMain.handle('project:write-rules', (_evt, payloadRaw: unknown) => {
  if (!payloadRaw || typeof payloadRaw !== 'object') return false;
  const p = payloadRaw as Record<string, unknown>;
  const workDir = isString(p.workDir, 4096) ? p.workDir : null;
  const name = isString(p.name, 128) ? p.name : null;
  if (!workDir || !name || !RULES_FILES.includes(name)) return false;
  if (typeof p.content !== 'string' || p.content.length > MAX_RULES_BYTES) return false;
  const full = path.join(workDir, name);
  if (!isInside(workDir, full)) return false;
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, p.content, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

function parseGitStatus(out: string): GitStatusResult {
  const lines = out.split(/\r?\n/).filter(Boolean);
  let branch = '';
  let changed = 0;
  const files: string[] = [];
  for (const line of lines) {
    if (line.startsWith('##')) {
      const m = line.match(/^## ([^.\s]+)/);
      branch = m ? m[1]! : line.slice(3);
      continue;
    }
    changed += 1;
    if (files.length < 50) files.push(line.trim());
  }
  return { branch, changed, files };
}

ipcMain.handle('project:git-status', (_evt, workDirRaw: unknown) => {
  const workDir = isString(workDirRaw, 4096) ? workDirRaw : null;
  if (!workDir) return Promise.resolve<GitStatusResult | null>(null);
  return new Promise<GitStatusResult | null>((resolve) => {
    let done = false;
    const finalize = (v: GitStatusResult | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn('git', ['status', '--porcelain=v1', '--branch'], {
        cwd: workDir,
        shell: false,
        env: { ...process.env },
      });
    } catch {
      finalize(null);
      return;
    }
    let out = '';
    child.stdout.on('data', (c) => {
      out += c.toString();
      if (out.length > 100_000) {
        try {
          child.kill();
        } catch {
          /* noop */
        }
      }
    });
    child.on('error', () => finalize(null));
    child.on('close', (code) => finalize(code === 0 ? parseGitStatus(out) : null));
    setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* noop */
      }
      finalize(null);
    }, 3000);
  });
});

// Salva um texto em arquivo escolhido pelo usuario (export de transcript/notas).
ipcMain.handle('app:save-text-file', async (_evt, payloadRaw: unknown) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!payloadRaw || typeof payloadRaw !== 'object') return false;
  const p = payloadRaw as Record<string, unknown>;
  const content = typeof p.content === 'string' ? p.content : '';
  const defaultName = isString(p.defaultName, 256) ? p.defaultName : 'mesp-export.md';
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName });
  if (result.canceled || !result.filePath) return false;
  try {
    fs.writeFileSync(result.filePath, content.slice(0, 5_000_000), 'utf-8');
    return true;
  } catch {
    return false;
  }
});
// git diff --stat da pasta do projeto (best-effort).
ipcMain.handle('project:git-diff', (_evt, workDirRaw: unknown) => {
  const workDir = isString(workDirRaw, 4096) ? workDirRaw : null;
  if (!workDir) return Promise.resolve<string | null>(null);
  return new Promise<string | null>((resolve) => {
    let done = false;
    const finalize = (v: string | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn('git', ['diff', '--stat', '--no-color'], {
        cwd: workDir,
        shell: false,
        env: { ...process.env },
      });
    } catch {
      finalize(null);
      return;
    }
    let out = '';
    child.stdout.on('data', (c) => {
      out += c.toString();
      if (out.length > 50_000) {
        try {
          child.kill();
        } catch {
          /* noop */
        }
      }
    });
    child.on('error', () => finalize(null));
    child.on('close', (code) => finalize(code === 0 ? out.trim() : null));
    setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* noop */
      }
      finalize(null);
    }, 3000);
  });
});

// HEAD curto (hash do ultimo commit) da pasta do projeto.
ipcMain.handle('project:git-head', (_evt, workDirRaw: unknown) => {
  const workDir = isString(workDirRaw, 4096) ? workDirRaw : null;
  if (!workDir) return Promise.resolve<string | null>(null);
  return new Promise<string | null>((resolve) => {
    let done = false;
    const finalize = (v: string | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: workDir,
        shell: false,
        env: { ...process.env },
      });
    } catch {
      finalize(null);
      return;
    }
    let out = '';
    child.stdout.on('data', (c) => {
      out += c.toString();
    });
    child.on('error', () => finalize(null));
    child.on('close', (code) => finalize(code === 0 ? out.trim() : null));
    setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* noop */
      }
      finalize(null);
    }, 2000);
  });
});

// Abre uma URL http(s) no navegador padrao (links clicaveis do terminal).
ipcMain.handle('app:open-external', (_evt, urlRaw: unknown) => {
  const url = isString(urlRaw, 4096) ? urlRaw : null;
  if (!url || !/^https?:\/\//i.test(url)) return false;
  void shell.openExternal(url);
  return true;
});

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
  return ~c >>> 0;
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
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };
  const bodyR = 12;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const d = Math.hypot(x - 16, y - 17);
      if (d <= bodyR) {
        if (d > bodyR - 2)
          put(x, y, 22, 32, 51); // contorno
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
    {
      label: windowVisible ? 'Esconder pets' : 'Mostrar pets',
      click: () => toggleWindowVisibility(),
    },
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
  void sync9RouterModels(false);

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
  applicationQuitting = true;
  try {
    globalShortcut.unregisterAll();
  } catch {
    /* noop */
  }
  if (tray) {
    try {
      tray.destroy();
    } catch {
      /* noop */
    }
    tray = null;
  }
  if (routerDashboardWindow && !routerDashboardWindow.isDestroyed()) {
    routerDashboardWindow.destroy();
  }
  routerDashboardWindow = null;
  if (bundledRouter) {
    terminateProjectCheckProcessOnShutdown(bundledRouter.child);
    bundledRouter = null;
  }
  for (const child of runningProcesses.values()) {
    try {
      child.kill();
    } catch {
      /* noop */
    }
  }
  runningProcesses.clear();
  for (const run of mespCodeProcesses.values()) {
    try {
      run.child.kill();
    } catch {
      /* noop */
    }
  }
  mespCodeProcesses.clear();
  for (const run of mespCodeFetches.values()) run.controller.abort();
  mespCodeFetches.clear();
  for (const run of mespCodeServerRuns.values()) {
    run.cancelled = true;
    run.controller.abort();
    void abortMespServerSession(run);
  }
  mespCodeServerRuns.clear();
  for (const run of projectCheckRuns.values()) {
    run.stopReason = 'shutdown';
    terminateProjectCheckProcessOnShutdown(run.child);
  }
  projectCheckRuns.clear();
  if (mespCodeServer) {
    try {
      mespCodeServer.child.kill();
    } catch {
      /* noop */
    }
    mespCodeServer = null;
  }
  for (const ptyProcess of terminalProcesses.values()) {
    try {
      ptyProcess.kill();
    } catch {
      /* noop */
    }
  }
  terminalProcesses.clear();
});
