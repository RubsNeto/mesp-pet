import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PetState } from '../types';
import {
  addTokenUsage,
  enqueueUniqueTask,
  normalizeStoredMespMessages,
  normalizeStoredMespQueue,
  shouldPauseQueueAfterVerification,
  takeNextQueuedTask,
  tokenUsageFromOpenCodeEvent,
} from '../services/mespCodeCore.mjs';

type MespCodeMode = 'fast' | 'plan' | 'assisted' | 'autonomous';
type ModelFilter = 'all' | 'cx' | 'kr' | 'gh' | 'open';
type ProjectCheckName = 'typecheck' | 'lint' | 'test' | 'build' | 'check';

interface TimelineEntry {
  id: string;
  kind: 'run' | 'permission' | 'tool' | 'verification';
  label: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
  at: number;
}

interface VerificationCheck {
  name: ProjectCheckName;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  code?: number | null;
  durationMs?: number;
  output: string;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  truncated?: boolean;
}

interface VerificationState {
  id: string;
  status: 'running' | 'passed' | 'failed' | 'cancelled';
  checks: VerificationCheck[];
}

interface QueuedPrompt {
  id: string;
  prompt: string;
  mode: MespCodeMode;
  model: string;
  limits: MespCodeLimits;
  cwd: string | null;
  createdAt: number;
}

interface MespCodeLimits {
  maxDurationMs: number;
  maxTokens: number;
  maxToolCalls: number;
}

interface PermissionRequest {
  id: string;
  action: string;
  resources: string[];
  remember: string[];
  tool?: string;
  requestId: string;
}

interface DiffReview {
  open: boolean;
  loading: boolean;
  files: Array<{
    file: string;
    patch: string;
    additions: number;
    deletions: number;
    status: string;
  }>;
  truncated?: boolean;
  error?: string;
}

export interface MespCodeStatus {
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
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: string[];
  status: 'streaming' | 'done' | 'error' | 'cancelled';
  error?: string;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  firstTokenMs?: number;
  mode?: MespCodeMode;
  model?: string;
  engine?: '9router' | 'opencode' | 'opencode-server';
  cwd?: string | null;
  sessionId?: string;
  messageId?: string;
  reverted?: boolean;
  timeline?: TimelineEntry[];
  verification?: VerificationState;
}

interface StoredChat {
  messages: ChatMessage[];
  sessionId: string | null;
  sessionCwd: string | null;
  sessionMode: MespCodeMode | null;
  selectedModel: string | null;
  mode: MespCodeMode;
  limits: MespCodeLimits;
  queue: QueuedPrompt[];
  queuePaused: boolean;
  autoVerify: boolean;
  selectedChecks: ProjectCheckName[];
}

interface MespCodeChatProps {
  petId: string;
  workDir: string | null;
  visible: boolean;
  status: MespCodeStatus | null;
  onStatusChange: (status: MespCodeStatus) => void;
  onPetStateChange?: (state: PetState) => void;
}

const PROVIDER_NAMES: Record<string, string> = {
  cx: 'Codex',
  kr: 'Kiro',
  gh: 'GitHub',
};

const SUGGESTIONS: Record<MespCodeMode, string[]> = {
  fast: [
    'Explique este trecho de codigo',
    'Compare duas abordagens tecnicas',
    'Escreva um exemplo pequeno e direto',
  ],
  plan: [
    'Analise este projeto e crie um plano',
    'Encontre riscos sem alterar arquivos',
    'Planeje a proxima funcionalidade',
  ],
  assisted: [
    'Implemente esta tarefa pedindo aprovacao',
    'Corrija o bug e mostre cada acao sensivel',
    'Rode os testes com minha autorizacao',
  ],
  autonomous: [
    'Implemente a proxima tarefa com testes',
    'Encontre e corrija o bug mais importante',
    'Rode os testes e resolva as falhas',
  ],
};
const EMPTY_MODELS: string[] = [];
const OPEN_MODEL_PATTERN =
  /(?:qwen|deepseek|llama|mistral|mixtral|minimax|glm|kimi|devstral|codestral)/i;
const MODE_OPTIONS: Array<{ id: MespCodeMode; label: string; short: string }> = [
  { id: 'fast', label: 'Rapido', short: 'baixo uso de tokens' },
  { id: 'plan', label: 'Plano', short: 'somente analise' },
  { id: 'assisted', label: 'Assistido', short: 'aprova cada acao' },
  { id: 'autonomous', label: 'Autonomo', short: 'acesso total' },
];
const MODE_LABELS: Record<MespCodeMode, string> = {
  fast: 'rapida',
  plan: 'plano',
  assisted: 'assistida',
  autonomous: 'autonoma',
};
const DEFAULT_LIMITS: MespCodeLimits = {
  maxDurationMs: 5 * 60_000,
  maxTokens: 25_000,
  maxToolCalls: 50,
};
const PROJECT_CHECK_ORDER: ProjectCheckName[] = ['typecheck', 'lint', 'test', 'build', 'check'];
const PROJECT_CHECK_LABELS: Record<ProjectCheckName, string> = {
  typecheck: 'Tipos',
  lint: 'Lint',
  test: 'Testes',
  build: 'Build',
  check: 'Check',
};

function storageKey(petId: string): string {
  return `mesp-code-chat-${petId}`;
}

function loadStoredChat(petId: string, workDir: string | null): StoredChat {
  try {
    const raw = localStorage.getItem(storageKey(petId));
    if (!raw) {
      return {
        messages: [],
        sessionId: null,
        sessionCwd: workDir,
        sessionMode: null,
        selectedModel: null,
        mode: 'fast',
        limits: DEFAULT_LIMITS,
        queue: [],
        queuePaused: false,
        autoVerify: false,
        selectedChecks: ['typecheck', 'lint', 'test', 'build'],
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredChat>;
    const messages = normalizeStoredMespMessages(parsed.messages, 80) as ChatMessage[];
    const queue = (normalizeStoredMespQueue(parsed.queue, 10) as QueuedPrompt[]).filter(
      (task) => task.cwd === workDir,
    );
    return {
      messages,
      sessionId:
        typeof parsed.sessionId === 'string' && parsed.sessionCwd === workDir
          ? parsed.sessionId
          : null,
      sessionCwd: workDir,
      sessionMode:
        typeof parsed.sessionId === 'string' &&
        parsed.sessionCwd === workDir &&
        (parsed.sessionMode === 'plan' ||
          parsed.sessionMode === 'assisted' ||
          parsed.sessionMode === 'autonomous')
          ? parsed.sessionMode
          : null,
      selectedModel: typeof parsed.selectedModel === 'string' ? parsed.selectedModel : null,
      mode:
        parsed.mode === 'plan' ||
        parsed.mode === 'assisted' ||
        parsed.mode === 'autonomous' ||
        parsed.mode === 'fast'
          ? parsed.mode
          : 'fast',
      limits: {
        maxDurationMs:
          typeof parsed.limits?.maxDurationMs === 'number'
            ? parsed.limits.maxDurationMs
            : DEFAULT_LIMITS.maxDurationMs,
        maxTokens:
          typeof parsed.limits?.maxTokens === 'number'
            ? parsed.limits.maxTokens
            : DEFAULT_LIMITS.maxTokens,
        maxToolCalls:
          typeof parsed.limits?.maxToolCalls === 'number'
            ? parsed.limits.maxToolCalls
            : DEFAULT_LIMITS.maxToolCalls,
      },
      queue,
      queuePaused: parsed.queuePaused === true && queue.length > 0,
      autoVerify: parsed.autoVerify === true,
      selectedChecks: Array.isArray(parsed.selectedChecks)
        ? PROJECT_CHECK_ORDER.filter((item) => parsed.selectedChecks?.includes(item))
        : ['typecheck', 'lint', 'test', 'build'],
    };
  } catch {
    return {
      messages: [],
      sessionId: null,
      sessionCwd: workDir,
      sessionMode: null,
      selectedModel: null,
      mode: 'fast',
      limits: DEFAULT_LIMITS,
      queue: [],
      queuePaused: false,
      autoVerify: false,
      selectedChecks: ['typecheck', 'lint', 'test', 'build'],
    };
  }
}

function seconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
}

function recentHistory(messages: ChatMessage[]) {
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let length = 0;
  for (let index = messages.length - 1; index >= 0 && result.length < 8; index -= 1) {
    const message = messages[index];
    if (!message.text.trim() || message.status === 'error' || message.status === 'cancelled') {
      continue;
    }
    const content = message.text.trim().slice(0, 6000);
    if (length + content.length > 20_000) break;
    result.unshift({ role: message.role, content });
    length += content.length;
  }
  return result;
}

function modelParts(model: string | null | undefined): { provider: string; name: string } {
  const clean = (model || '9router/modelo automatico').replace(/^9router\//, '');
  const [prefix, ...rest] = clean.split('/');
  return {
    provider: PROVIDER_NAMES[prefix] || (rest.length ? prefix.toUpperCase() : '9Router'),
    name: rest.length ? rest.join('/') : prefix,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function messageBlocks(text: string) {
  const parts = text.split('```');
  return parts.map((part, index) => {
    if (index % 2 === 0) {
      return part ? <span key={index}>{part}</span> : null;
    }
    const newline = part.indexOf('\n');
    const language = newline > 0 ? part.slice(0, newline).trim() : '';
    const code = newline > 0 ? part.slice(newline + 1) : part;
    return (
      <pre key={index} data-language={language || undefined}>
        <code>{code.trimEnd()}</code>
      </pre>
    );
  });
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function withTimeline(message: ChatMessage, entry: TimelineEntry): ChatMessage {
  const timeline = message.timeline ? [...message.timeline] : [];
  const existing = timeline.findIndex((item) => item.id === entry.id);
  if (existing >= 0) timeline[existing] = { ...entry, at: timeline[existing]!.at };
  else timeline.push(entry);
  timeline.sort((left, right) => left.at - right.at);
  return { ...message, timeline: timeline.slice(-32) };
}

export function MespCodeChat({
  petId,
  workDir,
  visible,
  status,
  onStatusChange,
  onPetStateChange,
}: MespCodeChatProps) {
  const initialRef = useRef(loadStoredChat(petId, workDir));
  const [messages, setMessages] = useState<ChatMessage[]>(initialRef.current.messages);
  const [sessionId, setSessionId] = useState<string | null>(initialRef.current.sessionId);
  const [sessionCwd, setSessionCwd] = useState<string | null>(initialRef.current.sessionCwd);
  const [sessionMode, setSessionMode] = useState<MespCodeMode | null>(
    initialRef.current.sessionMode,
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(
    initialRef.current.selectedModel,
  );
  const [mode, setMode] = useState<MespCodeMode>(initialRef.current.mode);
  const [limits, setLimits] = useState<MespCodeLimits>(initialRef.current.limits);
  const [queue, setQueue] = useState<QueuedPrompt[]>(initialRef.current.queue);
  const [queuePaused, setQueuePaused] = useState(initialRef.current.queuePaused);
  const [availableChecks, setAvailableChecks] = useState<ProjectCheckName[]>([]);
  const [selectedChecks, setSelectedChecks] = useState<ProjectCheckName[]>(
    initialRef.current.selectedChecks,
  );
  const [autoVerify, setAutoVerify] = useState(initialRef.current.autoVerify);
  const [verifyingMessageId, setVerifyingMessageId] = useState<string | null>(null);
  const [pendingAutoVerify, setPendingAutoVerify] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [modelFilter, setModelFilter] = useState<ModelFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [setupOpening, setSetupOpening] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [confirmAutonomous, setConfirmAutonomous] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const [permissionReplying, setPermissionReplying] = useState(false);
  const [diffReviews, setDiffReviews] = useState<Record<string, DiffReview>>({});
  const [revertMessage, setRevertMessage] = useState<ChatMessage | null>(null);
  const [reverting, setReverting] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeAssistantRef = useRef<string | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const activeCwdRef = useRef<string | null>(null);
  const activeModeRef = useRef<MespCodeMode | null>(null);
  const workDirRef = useRef(workDir);
  const cancellingRequestRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const seenTokenPartsRef = useRef(new Set<string>());
  const activeVerificationRef = useRef<{ id: string; messageId: string } | null>(null);
  const verificationWasAutoRef = useRef(false);
  const queueRef = useRef(queue);
  const autoVerifyRef = useRef(autoVerify);
  const availableChecksRef = useRef(availableChecks);
  const selectedChecksRef = useRef(selectedChecks);
  const mountedRef = useRef(true);
  const previousWorkDirRef = useRef(workDir);
  const firstTokenSeenRef = useRef(false);
  const stateChangeRef = useRef(onPetStateChange);
  const statusChangeRef = useRef(onStatusChange);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  stateChangeRef.current = onPetStateChange;
  statusChangeRef.current = onStatusChange;
  workDirRef.current = workDir;
  queueRef.current = queue;
  autoVerifyRef.current = autoVerify;
  availableChecksRef.current = availableChecks;
  selectedChecksRef.current = selectedChecks;

  const models = status?.models ?? EMPTY_MODELS;
  const effectiveModel = selectedModel || status?.model || models[0] || null;
  const selectedParts = modelParts(effectiveModel);
  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    return models.filter((model) => {
      const id = model.replace(/^9router\//, '');
      const prefix = id.split('/')[0];
      if (modelFilter !== 'all') {
        if (modelFilter === 'open' && !OPEN_MODEL_PATTERN.test(id)) return false;
        if (modelFilter !== 'open' && prefix !== modelFilter) return false;
      }
      return !query || model.toLowerCase().includes(query);
    });
  }, [models, modelFilter, modelQuery]);
  const occupied = busy || verifyingMessageId !== null || pendingAutoVerify !== null;

  useEffect(() => {
    if (!status || models.length === 0) return;
    if (!selectedModel || !models.includes(selectedModel)) {
      setSelectedModel(status.model && models.includes(status.model) ? status.model : models[0]!);
    }
  }, [status, models, selectedModel]);

  useEffect(() => {
    if (!status || !selectedModel || status.model === selectedModel) return;
    onStatusChange({ ...status, model: selectedModel });
  }, [onStatusChange, selectedModel, status]);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey(petId),
        JSON.stringify({
          messages: normalizeStoredMespMessages(messages, 80),
          sessionId,
          sessionCwd,
          sessionMode,
          selectedModel,
          mode,
          limits,
          queue: normalizeStoredMespQueue(queue, 10),
          queuePaused,
          autoVerify,
          selectedChecks,
        }),
      );
    } catch {
      /* noop */
    }
  }, [
    autoVerify,
    limits,
    messages,
    mode,
    petId,
    queue,
    queuePaused,
    selectedChecks,
    selectedModel,
    sessionCwd,
    sessionId,
    sessionMode,
  ]);

  useEffect(() => {
    let active = true;
    if (!workDir || !window.mesp?.getProjectChecks) {
      setAvailableChecks([]);
      return;
    }
    void (async () => {
      try {
        const result = await window.mesp!.getProjectChecks(workDir);
        if (!active) return;
        const checks = result.ok ? result.checks : [];
        setAvailableChecks(checks);
        setSelectedChecks((current) => {
          const retained = current.filter((check) => checks.includes(check));
          if (retained.length > 0) return retained;
          const primary = PROJECT_CHECK_ORDER.filter(
            (check) => check !== 'check' && checks.includes(check),
          );
          return primary.length > 0 ? primary : checks.slice(0, 1);
        });
      } catch {
        if (active) setAvailableChecks([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [workDir]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    const modalOpen = permission !== null || revertMessage !== null || confirmAutonomous;
    if (!modalOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (permission && !permissionReplying) {
        event.preventDefault();
        void window.mesp
          ?.replyMespCodePermission({
            petId,
            requestId: permission.requestId,
            permissionId: permission.id,
            reply: 'reject',
          })
          .finally(() => setPermission(null));
      } else if (revertMessage && !reverting) {
        setRevertMessage(null);
      } else if (confirmAutonomous) {
        setConfirmAutonomous(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => previousFocusRef.current?.focus(), 0);
    };
  }, [confirmAutonomous, permission, permissionReplying, petId, revertMessage, reverting]);

  const finishWithError = useCallback((error: string, requestId?: string) => {
    if (!mountedRef.current) return;
    if (requestId && activeRequestRef.current !== requestId) return;
    const assistantId = activeAssistantRef.current;
    if (assistantId) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId
            ? withTimeline(
                {
                  ...message,
                  status: 'error',
                  error,
                  text: message.text || 'Nao consegui responder.',
                },
                {
                  id: 'run-exit',
                  kind: 'run',
                  label: error,
                  status: 'error',
                  at: Date.now(),
                },
              )
            : message,
        ),
      );
    }
    activeAssistantRef.current = null;
    activeRequestRef.current = null;
    activeCwdRef.current = null;
    activeModeRef.current = null;
    cancellingRequestRef.current = null;
    submittingRef.current = false;
    setBusy(false);
    setCancelling(false);
    setPermission(null);
    setAnnouncement(error);
    stateChangeRef.current?.('error');
    window.setTimeout(() => {
      if (mountedRef.current) stateChangeRef.current?.('idle');
    }, 3000);
  }, []);

  useEffect(() => {
    const previousWorkDir = previousWorkDirRef.current;
    if (previousWorkDir === workDir) return;
    previousWorkDirRef.current = workDir;
    const hadQueuedTasks = queueRef.current.length > 0;
    queueRef.current = [];
    setQueue([]);
    setQueuePaused(false);
    setPendingAutoVerify(null);
    setSessionId(null);
    setSessionCwd(workDir);
    setSessionMode(null);
    setDiffReviews({});

    const verification = activeVerificationRef.current;
    if (verification) {
      void window.mesp
        ?.cancelMespCodeVerification?.(petId, verification.id)
        .catch(() => undefined);
    }
    const requestId = activeRequestRef.current;
    if (requestId) {
      cancellingRequestRef.current = requestId;
      void window.mesp?.cancelMespCode?.(petId, requestId).catch(() => undefined);
    }
    if (hadQueuedTasks || requestId || verification) {
      setAnnouncement('Pasta alterada. A execucao anterior foi interrompida e a fila foi limpa.');
    }
  }, [petId, workDir]);

  useEffect(() => {
    if (!window.mesp?.onMespCodeEvent) return;
    return window.mesp.onMespCodeEvent((data) => {
      if (data.petId !== petId) return;
      if (data.requestId !== activeRequestRef.current) return;
      const wasCancelled =
        data.cancelled === true || cancellingRequestRef.current === data.requestId;
      if (data.kind === 'started') {
        const assistantId = activeAssistantRef.current;
        if (assistantId && data.engine) {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? withTimeline(
                    { ...message, engine: data.engine },
                    {
                      id: 'run-start',
                      kind: 'run',
                      label: 'Execucao iniciada',
                      status: 'running',
                      at: Date.now(),
                    },
                  )
                : message,
            ),
          );
        }
        return;
      }
      if (data.kind === 'text' && data.text) {
        if (wasCancelled) return;
        const assistantId = activeAssistantRef.current;
        if (!assistantId) return;
        const firstToken = !firstTokenSeenRef.current;
        firstTokenSeenRef.current = true;
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? firstToken
                ? withTimeline(
                    { ...message, text: `${message.text}${data.text}` },
                    {
                      id: 'first-token',
                      kind: 'run',
                      label: 'Primeiro token recebido',
                      status: 'success',
                      at: Date.now(),
                    },
                  )
                : { ...message, text: `${message.text}${data.text}` }
              : message,
          ),
        );
        return;
      }
      if (data.kind === 'permission' && data.permission) {
        if (wasCancelled) return;
        setPermission({ ...data.permission, requestId: data.requestId });
        setAnnouncement(`Aprovacao necessaria para ${data.permission.action}.`);
        const assistantId = activeAssistantRef.current;
        if (assistantId) {
          const permissionId = data.permission.id;
          const permissionLabel = data.permission.tool || data.permission.action;
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? withTimeline(message, {
                    id: `permission-${permissionId}`,
                    kind: 'permission',
                    label: `Aguardando aprovacao: ${permissionLabel}`,
                    status: 'pending',
                    at: Date.now(),
                  })
                : message,
            ),
          );
        }
        stateChangeRef.current?.('waiting');
        return;
      }
      if (data.kind === 'event' && data.event) {
        const event = data.event;
        const eventSession = typeof event.sessionID === 'string' ? event.sessionID : null;
        if (
          eventSession &&
          !wasCancelled &&
          activeCwdRef.current === workDirRef.current
        ) {
          setSessionId(eventSession);
          setSessionCwd(activeCwdRef.current);
          setSessionMode(activeModeRef.current);
        }
        if (wasCancelled) return;
        const part = asRecord(event.part);
        const eventType = typeof event.type === 'string' ? event.type : '';
        const partType = part && typeof part.type === 'string' ? part.type : '';
        const assistantId = activeAssistantRef.current;
        if (!assistantId) return;
        if (eventSession) {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    sessionId: eventSession || message.sessionId,
                  }
                : message,
            ),
          );
        }

        if (eventType === 'message_updated') {
          const eventMessage = asRecord(event.message);
          if (
            eventMessage?.role === 'user' &&
            typeof eventMessage.id === 'string'
          ) {
            const userMessageId = eventMessage.id;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId ? { ...message, messageId: userMessageId } : message,
              ),
            );
          }
          return;
        }

        if (eventType === 'text' || partType === 'text') {
          const fragment =
            part && typeof part.text === 'string'
              ? part.text
              : typeof event.text === 'string'
                ? event.text
                : '';
          if (fragment) {
            const firstToken = !firstTokenSeenRef.current;
            firstTokenSeenRef.current = true;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? firstToken
                    ? withTimeline(
                        { ...message, text: `${message.text}${fragment}` },
                        {
                          id: 'first-token',
                          kind: 'run',
                          label: 'Primeiro texto recebido',
                          status: 'success',
                          at: Date.now(),
                        },
                      )
                    : { ...message, text: `${message.text}${fragment}` }
                  : message,
              ),
            );
          }
          return;
        }

        if (partType === 'tool' || eventType.includes('tool')) {
          const toolName =
            (part && typeof part.tool === 'string' && part.tool) ||
            (part && typeof part.name === 'string' && part.name) ||
            'ferramenta';
          const toolState = part ? asRecord(part.state) : null;
          const toolStatus =
            toolState && typeof toolState.status === 'string' ? toolState.status : 'executando';
          const toolId =
            (part && typeof part.callID === 'string' && part.callID) ||
            (part && typeof part.id === 'string' && part.id) ||
            `${toolName}-unidentified`;
          const label = `${toolName} · ${toolStatus}`;
          setMessages((previous) =>
            previous.map((message) => {
              if (message.id !== assistantId) return message;
              const tools =
                message.tools[message.tools.length - 1] === label
                  ? message.tools
                  : [...message.tools.slice(-7), label];
              return withTimeline(
                { ...message, tools },
                {
                  id: `tool-${toolId}`,
                  kind: 'tool',
                  label,
                  status:
                    toolStatus === 'completed'
                      ? 'success'
                      : toolStatus === 'error'
                        ? 'error'
                        : 'running',
                  at: Date.now(),
                },
              );
            }),
          );
          stateChangeRef.current?.('working');
          return;
        }

        if (eventType === 'step_finish' || partType === 'step-finish') {
          const partId = part && typeof part.id === 'string' ? part.id : null;
          if (partId && seenTokenPartsRef.current.has(partId)) return;
          const usage = tokenUsageFromOpenCodeEvent(event);
          if (usage) {
            if (partId) seenTokenPartsRef.current.add(partId);
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? (() => {
                      const totalUsage = addTokenUsage(
                        message.tokens === undefined
                          ? undefined
                          : {
                              total: message.tokens,
                              input: message.inputTokens,
                              output: message.outputTokens,
                            },
                        usage,
                      );
                      return {
                        ...message,
                        tokens: totalUsage?.total,
                        inputTokens: totalUsage?.input,
                        outputTokens: totalUsage?.output,
                      };
                    })()
                  : message,
              ),
            );
          }
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? withTimeline(message, {
                    id: `step-${partId || message.timeline?.length || 0}`,
                    kind: 'run',
                    label: usage
                      ? `${usage.total.toLocaleString()} tokens processados`
                      : 'Etapa concluida',
                    status: 'success',
                    at: Date.now(),
                  })
                : message,
            ),
          );
        }
        return;
      }
      if (data.kind === 'exit') {
        setPermission(null);
        if (
          data.sessionId &&
          !data.sessionInvalid &&
          activeCwdRef.current === workDirRef.current
        ) {
          setSessionId(data.sessionId);
          setSessionCwd(activeCwdRef.current);
          setSessionMode(activeModeRef.current);
        }
        if (data.sessionInvalid) {
          setSessionId(null);
          setSessionCwd(workDirRef.current);
          setSessionMode(null);
        }
        const assistantId = activeAssistantRef.current;
        if (wasCancelled) {
          if (assistantId) {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? withTimeline(
                      {
                        ...message,
                        status: 'cancelled',
                        durationMs: data.durationMs,
                        firstTokenMs: data.firstTokenMs,
                        sessionId: data.sessionId || message.sessionId,
                      },
                      {
                        id: 'run-exit',
                        kind: 'run',
                        label: 'Execucao interrompida',
                        status: 'cancelled',
                        at: Date.now(),
                      },
                    )
                  : message,
              ),
            );
          }
          activeAssistantRef.current = null;
          activeRequestRef.current = null;
          activeCwdRef.current = null;
          activeModeRef.current = null;
          cancellingRequestRef.current = null;
          submittingRef.current = false;
          setBusy(false);
          setCancelling(false);
          setQueuePaused(queueRef.current.length > 0);
          stateChangeRef.current?.('idle');
          return;
        }
        if (data.error || (data.code != null && data.code !== 0)) {
          if (
            data.error &&
            /\b(?:401|403)\b|unauthori[sz]ed|authentication failed/i.test(data.error) &&
            window.mesp?.getOpenCodeStatus
          ) {
            void window.mesp
              .getOpenCodeStatus(false)
              .then((next) => {
                if (mountedRef.current) statusChangeRef.current(next);
              })
              .catch(() => undefined);
          }
          finishWithError(
            data.error || `OpenCode encerrou com codigo ${data.code}`,
            data.requestId,
          );
          return;
        }
        if (assistantId) {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? withTimeline(
                    {
                      ...message,
                      status: 'done',
                      durationMs: data.durationMs,
                      firstTokenMs: data.firstTokenMs,
                      sessionId: data.sessionId || message.sessionId,
                    },
                    {
                      id: 'run-exit',
                      kind: 'run',
                      label: 'Execucao concluida',
                      status: 'success',
                      at: Date.now(),
                    },
                  )
                : message,
            ),
          );
        }
        activeAssistantRef.current = null;
        activeRequestRef.current = null;
        const completedMode = activeModeRef.current;
        activeCwdRef.current = null;
        activeModeRef.current = null;
        cancellingRequestRef.current = null;
        submittingRef.current = false;
        setBusy(false);
        setCancelling(false);
        if (
          assistantId &&
          autoVerifyRef.current &&
          (completedMode === 'assisted' || completedMode === 'autonomous') &&
          selectedChecksRef.current.some((check) => availableChecksRef.current.includes(check))
        ) {
          setPendingAutoVerify(assistantId);
          setAnnouncement('Tarefa concluida. Iniciando verificacoes.');
        } else {
          setAnnouncement('Tarefa concluida.');
        }
        stateChangeRef.current?.('success');
        window.setTimeout(() => {
          if (mountedRef.current) stateChangeRef.current?.('idle');
        }, 2500);
      }
    });
  }, [finishWithError, petId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const requestId = activeRequestRef.current;
      if (requestId && window.mesp?.cancelMespCode) {
        void window.mesp.cancelMespCode(petId, requestId);
      }
      const verification = activeVerificationRef.current;
      if (verification && window.mesp?.cancelMespCodeVerification) {
        void window.mesp.cancelMespCodeVerification(petId, verification.id);
      }
    };
  }, [petId]);

  const refreshModels = useCallback(async (force = false) => {
    if (!window.mesp?.getOpenCodeStatus || refreshing) return;
    setRefreshing(true);
    try {
      const next = await window.mesp.getOpenCodeStatus(force);
      if (mountedRef.current) onStatusChange(next);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [onStatusChange, refreshing]);

  const openRouterSetup = useCallback(async () => {
    if (!window.mesp?.open9RouterDashboard || setupOpening) return;
    setSetupOpening(true);
    setSetupError('');
    try {
      const result = await window.mesp.open9RouterDashboard();
      if (!mountedRef.current) return;
      if (!result.ok) {
        setSetupError(result.error || 'Nao foi possivel abrir a configuracao.');
        return;
      }
      setAnnouncement('Configuracao do 9Router aberta.');
    } catch {
      if (mountedRef.current) setSetupError('Nao foi possivel abrir a configuracao.');
    } finally {
      if (mountedRef.current) setSetupOpening(false);
    }
  }, [setupOpening]);

  useEffect(() => {
    if (!visible) return;
    void refreshModels(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const activateMode = useCallback(
    (nextMode: MespCodeMode) => {
      if (occupied || nextMode === mode) return;
      if (nextMode === 'autonomous') {
        setConfirmAutonomous(true);
        return;
      }
      setMode(nextMode);
      setSessionId(null);
      setSessionCwd(workDirRef.current);
      setSessionMode(null);
    },
    [mode, occupied],
  );

  const acceptAutonomous = useCallback(() => {
    setMode('autonomous');
    setSessionId(null);
    setSessionCwd(workDirRef.current);
    setSessionMode(null);
    setConfirmAutonomous(false);
  }, []);

  const replyPermission = useCallback(
    async (reply: 'once' | 'always' | 'reject') => {
      if (!permission || permissionReplying || !window.mesp?.replyMespCodePermission) return;
      setPermissionReplying(true);
      try {
        const result = await window.mesp.replyMespCodePermission({
          petId,
          requestId: permission.requestId,
          permissionId: permission.id,
          reply,
        });
        if (!mountedRef.current) return;
        if (!result.ok) {
          setAnnouncement(result.error || 'Nao foi possivel responder a aprovacao.');
          return;
        }
        const assistantId = activeAssistantRef.current;
        if (assistantId) {
          const permissionId = permission.id;
          const permissionLabel = permission.tool || permission.action;
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? withTimeline(message, {
                    id: `permission-${permissionId}`,
                    kind: 'permission',
                    label:
                      reply === 'reject'
                        ? `Acao negada: ${permissionLabel}`
                        : `Acao autorizada: ${permissionLabel}`,
                    status: reply === 'reject' ? 'cancelled' : 'success',
                    at: Date.now(),
                  })
                : message,
            ),
          );
        }
        setPermission(null);
        setAnnouncement(reply === 'reject' ? 'Acao negada.' : 'Acao autorizada.');
        stateChangeRef.current?.('working');
      } catch (error) {
        if (mountedRef.current) setAnnouncement((error as Error).message);
      } finally {
        if (mountedRef.current) setPermissionReplying(false);
      }
    },
    [permission, permissionReplying, petId],
  );

  const reviewChanges = useCallback(
    async (message: ChatMessage) => {
      const current = diffReviews[message.id];
      if (current && !current.loading) {
        setDiffReviews((previous) => ({
          ...previous,
          [message.id]: { ...current, open: !current.open },
        }));
        return;
      }
      if (!message.sessionId || !message.messageId || !workDir || !window.mesp?.getMespCodeDiff) {
        return;
      }
      setDiffReviews((previous) => ({
        ...previous,
        [message.id]: { open: true, loading: true, files: [] },
      }));
      try {
        const result = await window.mesp.getMespCodeDiff({
          sessionId: message.sessionId,
          messageId: message.messageId,
          cwd: workDir,
        });
        if (!mountedRef.current) return;
        setDiffReviews((previous) => ({
          ...previous,
          [message.id]: {
            open: true,
            loading: false,
            files: result.files || [],
            truncated: result.truncated,
            error: result.ok ? undefined : result.error || 'Nao foi possivel carregar o diff.',
          },
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        setDiffReviews((previous) => ({
          ...previous,
          [message.id]: {
            open: true,
            loading: false,
            files: [],
            error: (error as Error).message,
          },
        }));
      }
    },
    [diffReviews, workDir],
  );

  const confirmRevert = useCallback(async () => {
    if (
      !revertMessage?.sessionId ||
      !revertMessage.messageId ||
      !workDir ||
      !window.mesp?.revertMespCode ||
      reverting
    ) {
      return;
    }
    setReverting(true);
    try {
      const result = await window.mesp.revertMespCode({
        sessionId: revertMessage.sessionId,
        messageId: revertMessage.messageId,
        cwd: workDir,
      });
      if (!mountedRef.current) return;
      if (!result.ok) {
        setAnnouncement(result.error || 'Nao foi possivel reverter as mudancas.');
        return;
      }
      setMessages((previous) =>
        previous.map((message) =>
          message.id === revertMessage.id ? { ...message, reverted: true } : message,
        ),
      );
      setDiffReviews((previous) => {
        const next = { ...previous };
        delete next[revertMessage.id];
        return next;
      });
      setRevertMessage(null);
      setAnnouncement('Mudancas desta etapa revertidas.');
    } catch (error) {
      if (mountedRef.current) setAnnouncement((error as Error).message);
    } finally {
      if (mountedRef.current) setReverting(false);
    }
  }, [revertMessage, reverting, workDir]);

  useEffect(() => {
    if (!window.mesp?.onMespCodeVerifyEvent) return;
    return window.mesp.onMespCodeVerifyEvent((data) => {
      const active = activeVerificationRef.current;
      if (
        data.petId !== petId ||
        !active ||
        data.verificationId !== active.id ||
        data.messageId !== active.messageId
      ) {
        return;
      }
      setMessages((previous) =>
        previous.map((message) => {
          if (message.id !== data.messageId || !message.verification) return message;
          let verification = message.verification;
          if (data.kind === 'check-started' && data.check) {
            verification = {
              ...verification,
              checks: verification.checks.map((check) =>
                check.name === data.check ? { ...check, status: 'running' } : check,
              ),
            };
            return withTimeline(
              { ...message, verification },
              {
                id: `verify-${data.check}-start`,
                kind: 'verification',
                label: `${PROJECT_CHECK_LABELS[data.check]} em execucao`,
                status: 'running',
                at: Date.now(),
              },
            );
          }
          if (data.kind === 'check-output' && data.check && data.text) {
            const stream = data.stream === 'stderr' ? 'stderr' : 'stdout';
            verification = {
              ...verification,
              checks: verification.checks.map((check) =>
                check.name === data.check
                  ? {
                      ...check,
                      [stream]: `${check[stream] || ''}${data.text}`.slice(-12_000),
                    }
                  : check,
              ),
            };
            return { ...message, verification };
          }
          if (data.kind === 'check-exit' && data.check) {
            const cancelled = data.cancelled === true;
            const passed = !cancelled && data.code === 0;
            verification = {
              ...verification,
              checks: verification.checks.map((check) =>
                check.name === data.check
                  ? {
                      ...check,
                      status: cancelled ? 'cancelled' : passed ? 'passed' : 'failed',
                      code: data.code,
                      durationMs: data.durationMs,
                      timedOut: data.timedOut,
                      truncated: data.truncated,
                    }
                  : check,
              ),
            };
            return withTimeline(
              { ...message, verification },
              {
                id: `verify-${data.check}-exit`,
                kind: 'verification',
                label: `${PROJECT_CHECK_LABELS[data.check]} ${
                  cancelled ? 'foi interrompido' : passed ? 'passou' : 'falhou'
                }`,
                status: cancelled ? 'cancelled' : passed ? 'success' : 'error',
                at: Date.now(),
              },
            );
          }
          if (data.kind === 'exit') {
            const status = data.cancelled ? 'cancelled' : data.passed ? 'passed' : 'failed';
            verification = {
              ...verification,
              status,
              checks: verification.checks.map((check) =>
                data.cancelled && (check.status === 'pending' || check.status === 'running')
                  ? { ...check, status: 'cancelled' }
                  : check,
              ),
            };
            return withTimeline(
              { ...message, verification },
              {
                id: 'verify-exit',
                kind: 'verification',
                label: data.cancelled
                  ? 'Verificacao interrompida'
                  : data.passed
                    ? 'Todas as verificacoes passaram'
                    : 'Verificacao falhou',
                status: data.cancelled ? 'cancelled' : data.passed ? 'success' : 'error',
                at: Date.now(),
              },
            );
          }
          return message;
        }),
      );
      if (data.kind === 'exit') {
        const wasAuto = verificationWasAutoRef.current;
        activeVerificationRef.current = null;
        verificationWasAutoRef.current = false;
        setVerifyingMessageId(null);
        setPendingAutoVerify(null);
        const pauseQueue = shouldPauseQueueAfterVerification({
          automatic: wasAuto,
          passed: data.passed === true,
          cancelled: data.cancelled === true,
          pendingCount: queueRef.current.length,
        });
        if (pauseQueue) setQueuePaused(true);
        setAnnouncement(
          data.cancelled
            ? 'Verificacao interrompida.'
            : data.passed
              ? 'Todas as verificacoes passaram.'
              : wasAuto && queueRef.current.length > 0
                ? 'Uma verificacao falhou. A fila foi pausada.'
                : 'Uma verificacao falhou.',
        );
        stateChangeRef.current?.(data.passed ? 'success' : data.cancelled ? 'idle' : 'error');
      }
    });
  }, [petId]);

  const runVerification = useCallback(
    async (message: ChatMessage, automatic = false) => {
      if (
        busy ||
        verifyingMessageId ||
        activeVerificationRef.current ||
        !workDir ||
        !window.mesp?.verifyMespCode ||
        message.status !== 'done'
      ) {
        return;
      }
      if (message.cwd && message.cwd !== workDir) {
        setAnnouncement('Esta resposta pertence a outra pasta. Verifique-a no projeto original.');
        return;
      }
      const checks = PROJECT_CHECK_ORDER.filter(
        (check) => selectedChecks.includes(check) && availableChecks.includes(check),
      );
      if (checks.length === 0) {
        setPendingAutoVerify(null);
        setAnnouncement('Este projeto nao possui verificacoes selecionadas.');
        return;
      }
      const verificationId = id('verify');
      activeVerificationRef.current = { id: verificationId, messageId: message.id };
      verificationWasAutoRef.current = automatic;
      setVerifyingMessageId(message.id);
      setMessages((previous) =>
        previous.map((item) =>
          item.id === message.id
            ? withTimeline(
                {
                  ...item,
                  timeline: item.timeline?.filter((entry) => entry.kind !== 'verification'),
                  verification: {
                    id: verificationId,
                    status: 'running',
                    checks: checks.map((name) => ({ name, status: 'pending', output: '' })),
                  },
                },
                {
                  id: 'verify-start',
                  kind: 'verification',
                  label: 'Verificacao iniciada',
                  status: 'running',
                  at: Date.now(),
                },
              )
            : item,
        ),
      );
      stateChangeRef.current?.('working');
      const failToStart = (error: string) => {
        if (activeVerificationRef.current?.id !== verificationId) return;
        activeVerificationRef.current = null;
        verificationWasAutoRef.current = false;
        setVerifyingMessageId(null);
        setPendingAutoVerify(null);
        if (automatic && queueRef.current.length > 0) setQueuePaused(true);
        setMessages((previous) =>
          previous.map((item) =>
            item.id === message.id && item.verification
              ? withTimeline(
                  {
                    ...item,
                    verification: { ...item.verification, status: 'failed' },
                  },
                  {
                    id: 'verify-exit',
                    kind: 'verification',
                    label: error,
                    status: 'error',
                    at: Date.now(),
                  },
                )
              : item,
          ),
        );
        setAnnouncement(error);
        stateChangeRef.current?.('error');
      };
      try {
        const result = await window.mesp.verifyMespCode({
          petId,
          verificationId,
          messageId: message.id,
          cwd: workDir,
          checks,
        });
        if (!mountedRef.current) return;
        if (!result.ok) {
          failToStart(result.error || 'Nao foi possivel iniciar a verificacao.');
        }
      } catch (error) {
        if (mountedRef.current) failToStart((error as Error).message);
      }
    },
    [availableChecks, busy, petId, selectedChecks, verifyingMessageId, workDir],
  );

  useEffect(() => {
    if (!pendingAutoVerify || busy || verifyingMessageId) return;
    const message = messages.find((item) => item.id === pendingAutoVerify);
    if (!message) {
      setPendingAutoVerify(null);
      return;
    }
    setPendingAutoVerify(null);
    void runVerification(message, true);
  }, [busy, messages, pendingAutoVerify, runVerification, verifyingMessageId]);

  const startPrompt = useCallback(async (task: QueuedPrompt) => {
    if (
      submittingRef.current ||
      activeRequestRef.current ||
      activeVerificationRef.current ||
      task.cwd !== workDirRef.current
    ) {
      if (task.cwd !== workDirRef.current) {
        setAnnouncement('Tarefa ignorada porque a pasta do projeto mudou.');
      }
      return;
    }
    submittingRef.current = true;
    const requestId = id('run');
    const userMessage: ChatMessage = {
      id: id('user'),
      role: 'user',
      text: task.prompt,
      tools: [],
      status: 'done',
      mode: task.mode,
      cwd: task.cwd,
    };
    const assistantMessage: ChatMessage = {
      id: id('assistant'),
      role: 'assistant',
      text: '',
      tools: [],
      status: 'streaming',
      mode: task.mode,
      model: task.model,
      cwd: task.cwd,
    };
    const canResumeSession =
      task.mode !== 'fast' && sessionMode === task.mode && sessionCwd === task.cwd;
    if (task.mode !== mode) {
      setMode(task.mode);
      setSessionId(null);
      setSessionCwd(task.cwd);
      setSessionMode(null);
    }
    setSelectedModel(task.model);
    activeAssistantRef.current = assistantMessage.id;
    activeRequestRef.current = requestId;
    activeCwdRef.current = task.cwd;
    activeModeRef.current = task.mode;
    cancellingRequestRef.current = null;
    seenTokenPartsRef.current = new Set();
    firstTokenSeenRef.current = false;
    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setInput('');
    setModelOpen(false);
    setLimitsOpen(false);
    setBusy(true);
    setCancelling(false);
    stateChangeRef.current?.('thinking');

    if (!window.mesp?.sendMespCode) {
      finishWithError('Abra o MESP pelo aplicativo desktop para conversar.', requestId);
      return;
    }
    try {
      const result = await window.mesp.sendMespCode({
        petId,
        requestId,
        prompt: task.prompt,
        model: task.model,
        mode: task.mode,
        sessionId: canResumeSession ? sessionId : null,
        cwd: task.cwd || undefined,
        history: task.mode === 'fast' ? recentHistory(messages) : undefined,
        limits: task.limits,
      });
      if (!result.ok) {
        finishWithError(result.error || 'Nao foi possivel iniciar o OpenCode.', requestId);
      }
    } catch (error) {
      finishWithError((error as Error).message, requestId);
    }
  }, [finishWithError, messages, mode, petId, sessionCwd, sessionId, sessionMode]);

  const send = useCallback(() => {
    const prompt = input.trim();
    if (!prompt) return;
    if (status?.runtime?.setupRequired) {
      setAnnouncement('Configure pelo menos um provedor antes de enviar uma tarefa.');
      return;
    }
    if (!effectiveModel) {
      finishWithError('Nenhum modelo do 9Router esta disponivel.');
      return;
    }
    const task: QueuedPrompt = {
      id: id('queue'),
      prompt,
      mode,
      model: effectiveModel,
      limits: { ...limits },
      cwd: workDir,
      createdAt: Date.now(),
    };
    if (occupied || submittingRef.current || queuePaused || queueRef.current.length > 0) {
      const queued = enqueueUniqueTask(queueRef.current, task, 10);
      if (!queued.added) {
        setAnnouncement('A fila ja possui o limite de 10 tarefas.');
        return;
      }
      const nextQueue = [...queued.queue] as QueuedPrompt[];
      queueRef.current = nextQueue;
      setQueue(nextQueue);
      setInput('');
      setAnnouncement('Tarefa adicionada a fila.');
      return;
    }
    void startPrompt(task);
  }, [effectiveModel, finishWithError, input, limits, mode, occupied, queuePaused, startPrompt, status?.runtime?.setupRequired, workDir]);

  useEffect(() => {
    if (submittingRef.current) return;
    const next = takeNextQueuedTask(queueRef.current, { paused: queuePaused, occupied });
    if (!next.task) return;
    const remaining = [...next.queue] as QueuedPrompt[];
    queueRef.current = remaining;
    setQueue(remaining);
    void startPrompt(next.task as QueuedPrompt);
  }, [occupied, queue, queuePaused, startPrompt]);

  const cancel = useCallback(async () => {
    setQueuePaused(queueRef.current.length > 0);
    if (pendingAutoVerify && !activeVerificationRef.current) {
      setPendingAutoVerify(null);
      setAnnouncement(
        queueRef.current.length > 0
          ? 'Verificacao automatica cancelada. A fila foi pausada.'
          : 'Verificacao automatica cancelada.',
      );
      return;
    }
    const verification = activeVerificationRef.current;
    if (verification) {
      setCancelling(true);
      try {
        await window.mesp?.cancelMespCodeVerification?.(petId, verification.id);
      } finally {
        if (mountedRef.current) setCancelling(false);
      }
      return;
    }
    const requestId = activeRequestRef.current;
    if (!requestId || cancellingRequestRef.current) return;
    cancellingRequestRef.current = requestId;
    setCancelling(true);
    const assistantId = activeAssistantRef.current;
    if (assistantId) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId ? { ...message, status: 'cancelled' } : message,
        ),
      );
    }
    if (!window.mesp?.cancelMespCode) {
      finishWithError('Nao foi possivel interromper fora do aplicativo desktop.', requestId);
      return;
    }
    try {
      const accepted = await window.mesp.cancelMespCode(petId, requestId);
      if (!accepted && activeRequestRef.current === requestId) {
        finishWithError('O processo ja nao estava mais disponivel para interrupcao.', requestId);
      }
    } catch (error) {
      finishWithError((error as Error).message, requestId);
    }
  }, [finishWithError, pendingAutoVerify, petId]);

  const newChat = useCallback(() => {
    if (occupied) return;
    setMessages([]);
    queueRef.current = [];
    setQueue([]);
    setQueuePaused(false);
    setSessionId(null);
    setSessionCwd(workDirRef.current);
    setSessionMode(null);
    setInput('');
    setDiffReviews({});
    stateChangeRef.current?.('idle');
  }, [occupied]);

  return (
    <section className="mesp-chat" aria-label="Chat MESP Code">
      <div className="mesp-chat-toolbar">
        <div className="mesp-model-control">
          <button
            type="button"
            className="mesp-model-trigger"
            onClick={() => setModelOpen((open) => !open)}
            disabled={occupied}
            aria-expanded={modelOpen}
            aria-haspopup="listbox"
          >
            <span className="mesp-model-provider">{selectedParts.provider}</span>
            <strong>{selectedParts.name}</strong>
            <span className="mesp-model-chevron" aria-hidden="true">
              ⌄
            </span>
          </button>
          {modelOpen && (
            <div className="mesp-model-popover">
              <div className="mesp-model-search-row">
                <input
                  type="search"
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  placeholder={`Buscar entre ${models.length} modelos`}
                  aria-label="Buscar modelo"
                  autoFocus
                />
                <button
                  type="button"
                  className="mesp-model-refresh"
                  onClick={() => void refreshModels(true)}
                  disabled={refreshing}
                  aria-label="Sincronizar modelos"
                  title="Sincronizar modelos do 9Router"
                >
                  ↻
                </button>
              </div>
              <div className="mesp-model-filters" aria-label="Filtrar modelos">
                {(
                  [
                    ['all', 'Todos'],
                    ['cx', 'Codex'],
                    ['kr', 'Kiro'],
                    ['gh', 'GitHub'],
                    ['open', 'Open source'],
                  ] as Array<[ModelFilter, string]>
                ).map(([filter, label]) => (
                  <button
                    type="button"
                    className={modelFilter === filter ? 'selected' : ''}
                    aria-pressed={modelFilter === filter}
                    key={filter}
                    onClick={() => setModelFilter(filter)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mesp-model-list" role="listbox" aria-label="Modelos do 9Router">
                {filteredModels.map((model) => {
                  const parts = modelParts(model);
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={model === effectiveModel}
                      className={`mesp-model-option${model === effectiveModel ? ' selected' : ''}`}
                      key={model}
                      onClick={() => {
                        setSelectedModel(model);
                        setModelOpen(false);
                        setModelQuery('');
                      }}
                    >
                      <span>{parts.provider}</span>
                      <strong>{parts.name}</strong>
                    </button>
                  );
                })}
                {filteredModels.length === 0 && (
                  <div className="mesp-model-empty">Nenhum modelo encontrado.</div>
                )}
              </div>
              <div className="mesp-model-footer">
                {models.length} modelos · sincronizados pelo 9Router
              </div>
            </div>
          )}
        </div>
        <div className="mesp-limits-control">
          <button
            type="button"
            className="mesp-limits-trigger"
            onClick={() => setLimitsOpen((open) => !open)}
            disabled={occupied}
            aria-expanded={limitsOpen}
            aria-haspopup="dialog"
          >
            Limites · {Math.round(limits.maxDurationMs / 60_000)}m ·{' '}
            {Math.round(limits.maxTokens / 1000)}k
          </button>
          {limitsOpen && (
            <div className="mesp-limits-popover" role="dialog" aria-label="Limites por execucao">
              <label>
                Tempo maximo
                <select
                  value={limits.maxDurationMs}
                  onChange={(event) =>
                    setLimits((current) => ({
                      ...current,
                      maxDurationMs: Number(event.target.value),
                    }))
                  }
                >
                  <option value={120000}>2 minutos</option>
                  <option value={300000}>5 minutos</option>
                  <option value={600000}>10 minutos</option>
                  <option value={1200000}>20 minutos</option>
                </select>
              </label>
              <label>
                Tokens maximos
                <select
                  value={limits.maxTokens}
                  onChange={(event) =>
                    setLimits((current) => ({ ...current, maxTokens: Number(event.target.value) }))
                  }
                >
                  <option value={10000}>10.000 tokens</option>
                  <option value={25000}>25.000 tokens</option>
                  <option value={50000}>50.000 tokens</option>
                  <option value={100000}>100.000 tokens</option>
                </select>
              </label>
              <label>
                Chamadas de ferramentas
                <select
                  value={limits.maxToolCalls}
                  onChange={(event) =>
                    setLimits((current) => ({
                      ...current,
                      maxToolCalls: Number(event.target.value),
                    }))
                  }
                >
                  <option value={20}>20 chamadas</option>
                  <option value={50}>50 chamadas</option>
                  <option value={100}>100 chamadas</option>
                  <option value={200}>200 chamadas</option>
                </select>
              </label>
              <small>Valem para a proxima mensagem.</small>
              <div className="mesp-quality-config">
                <div className="mesp-quality-heading">
                  <strong>Quality gates</strong>
                  <span>{selectedChecks.length}/{availableChecks.length}</span>
                </div>
                {availableChecks.length > 0 ? (
                  <>
                    <div className="mesp-quality-checks" role="group" aria-label="Verificacoes do projeto">
                      {PROJECT_CHECK_ORDER.filter((check) => availableChecks.includes(check)).map(
                        (check) => {
                          const checkId = `mesp-check-${petId}-${check}`;
                          return (
                            <label htmlFor={checkId} key={check}>
                              <input
                                id={checkId}
                                type="checkbox"
                                checked={selectedChecks.includes(check)}
                                onChange={(event) =>
                                  setSelectedChecks((current) =>
                                    event.target.checked
                                      ? PROJECT_CHECK_ORDER.filter(
                                          (item) => item === check || current.includes(item),
                                        )
                                      : current.filter((item) => item !== check),
                                  )
                                }
                              />
                              <span>{PROJECT_CHECK_LABELS[check]}</span>
                            </label>
                          );
                        },
                      )}
                    </div>
                    <label className="mesp-quality-auto" htmlFor={`mesp-auto-verify-${petId}`}>
                      <input
                        id={`mesp-auto-verify-${petId}`}
                        type="checkbox"
                        checked={autoVerify}
                        disabled={selectedChecks.length === 0}
                        onChange={(event) => setAutoVerify(event.target.checked)}
                      />
                      <span>
                        <strong>Verificar automaticamente</strong>
                        <small>Apos tarefas Assistidas e Autonomas.</small>
                      </span>
                    </label>
                    <p>Os scripts selecionados executam codigo deste projeto.</p>
                  </>
                ) : (
                  <p>Nenhum script conhecido foi encontrado no package.json.</p>
                )}
              </div>
            </div>
          )}
        </div>
        <span className="mesp-chat-session">
          {mode === 'fast'
            ? 'contexto curto'
            : sessionId
              ? `sessao ${sessionId.slice(-6)}`
              : 'nova sessao'}
        </span>
        {status?.runtime && (
          <span
            className={`mesp-runtime-badge${status.runtime.portableReady ? ' is-ready' : ''}`}
            title={`OpenCode: ${status.runtime.opencode}; 9Router: ${status.runtime.router}; Node/npm: ${status.runtime.node}/${status.runtime.npm}`}
          >
            <span aria-hidden="true" />
            {status.runtime.portableReady ? 'Runtime integrado' : 'Runtime parcial'}
          </span>
        )}
        <button
          type="button"
          className="mesp-chat-new"
          onClick={newChat}
          disabled={occupied || messages.length === 0}
          title="Nova conversa"
        >
          <span aria-hidden="true">+</span> Nova conversa
        </button>
      </div>

      {status && status.routerState !== 'ready' && status.routerState !== 'unknown' && (
        <div
          className={`mesp-router-status state-${status.routerState}`}
          role={status.routerState === 'unauthorized' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span className="mesp-router-status-dot" aria-hidden="true" />
          <div>
            <strong>
              {status.routerState === 'unauthorized'
                ? 'Autenticacao recusada'
                : status.routerState === 'misconfigured'
                  ? 'Configuracao necessaria'
                  : '9Router indisponivel'}
            </strong>
            <span>{status.routerMessage}</span>
            {setupError && <span className="mesp-router-setup-error">{setupError}</span>}
          </div>
          <div className="mesp-router-status-actions">
            {status.runtime?.setupRequired && window.mesp?.open9RouterDashboard && (
              <button
                type="button"
                className="primary"
                onClick={() => void openRouterSetup()}
                disabled={setupOpening}
              >
                {setupOpening ? 'Abrindo...' : 'Configurar provedores'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void refreshModels(true)}
              disabled={refreshing || setupOpening}
            >
              {refreshing ? 'Verificando...' : 'Tentar novamente'}
            </button>
          </div>
        </div>
      )}

      <div className={`mesp-mode-bar mode-${mode}`}>
        <div className="mesp-mode-switcher" role="tablist" aria-label="Modo do agente">
          {MODE_OPTIONS.map((option) => (
            <button
              type="button"
              role="tab"
              aria-selected={mode === option.id}
              className={mode === option.id ? 'selected' : ''}
              disabled={occupied}
              key={option.id}
              onClick={() => activateMode(option.id)}
            >
              <span className="mesp-mode-dot" aria-hidden="true" />
              <strong>{option.label}</strong>
              <small>{option.short}</small>
            </button>
          ))}
        </div>
        <p>
          {mode === 'fast' && 'Resposta direta pelo 9Router, com contexto curto e sem ferramentas.'}
          {mode === 'plan' &&
            'O MESP pode investigar o projeto, mas nao pode editar nem executar comandos.'}
          {mode === 'assisted' &&
            'Leitura livre; edicoes e comandos aguardam sua aprovacao antes de executar.'}
          {mode === 'autonomous' &&
            'Acesso irrestrito: pode editar arquivos e executar comandos sem confirmacao.'}
        </p>
      </div>

      {queue.length > 0 && (
        <section
          className={`mesp-prompt-queue${queuePaused ? ' paused' : ''}`}
          aria-label="Fila de tarefas"
        >
          <header>
            <div>
              <strong>Fila</strong>
              <span>
                {queue.length} {queue.length === 1 ? 'tarefa' : 'tarefas'}
              </span>
            </div>
            {queuePaused && queue.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQueuePaused(false);
                  setAnnouncement('Fila retomada.');
                }}
              >
                Retomar
              </button>
            )}
          </header>
          {queuePaused && queue.length > 0 && (
            <p>A fila foi pausada para voce revisar o resultado anterior.</p>
          )}
          <ol>
            {queue.map((task) => (
              <li key={task.id}>
                <span className={`mesp-queue-mode mode-${task.mode}`}>
                  {MODE_LABELS[task.mode]}
                </span>
                <span title={task.prompt}>{task.prompt}</span>
                <button
                  type="button"
                  aria-label={`Remover da fila: ${task.prompt.slice(0, 60)}`}
                  title="Remover da fila"
                  onClick={() => {
                    const next = queueRef.current.filter((item) => item.id !== task.id);
                    queueRef.current = next;
                    setQueue(next);
                    if (next.length === 0) setQueuePaused(false);
                  }}
                >
                  Remover
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="mesp-chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="mesp-chat-empty-state">
            <div className="mesp-chat-empty-eye" aria-hidden="true">
              <span />
            </div>
            <p className="mesp-chat-eyebrow">MESP esta ouvindo</p>
            <h2>O que vamos construir?</h2>
            <p>
              {mode === 'fast'
                ? 'Pergunte e receba uma resposta leve. Para agir no repositorio, use Assistido ou Autonomo.'
                : 'Converse com o agente, troque de modelo quando quiser e acompanhe o pet reagir ao trabalho.'}
            </p>
            <div className="mesp-chat-suggestions">
              {SUGGESTIONS[mode].map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => setInput(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mesp-chat-messages">
            {messages.map((message) => (
              <article className={`mesp-message role-${message.role}`} key={message.id}>
                <header>
                  <span className="mesp-message-role">
                    {message.role === 'user' ? 'VOCE' : 'MESP'}
                  </span>
                  {message.role === 'assistant' && message.mode && (
                    <span className={`mesp-message-mode mode-${message.mode}`}>
                      {message.mode === 'fast'
                        ? 'rapido'
                        : message.mode === 'plan'
                          ? 'plano'
                          : message.mode === 'assisted'
                            ? 'assistido'
                            : 'autonomo'}
                    </span>
                  )}
                  {message.role === 'assistant' && message.status === 'streaming' && (
                    <span className="mesp-message-live">
                      {permission && message.id === activeAssistantRef.current
                        ? 'aguardando aprovacao'
                        : 'respondendo'}
                    </span>
                  )}
                </header>
                {message.tools.length > 0 && (
                  <div className="mesp-tool-list">
                    {message.tools.map((tool, index) => (
                      <div className="mesp-tool-event" key={`${tool}-${index}`}>
                        <span aria-hidden="true" /> {tool}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mesp-message-content">
                  {message.text ? (
                    messageBlocks(message.text)
                  ) : message.status === 'streaming' ? (
                    <span className="mesp-typing" aria-label="MESP esta pensando">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <span>{message.status === 'cancelled' ? 'Resposta interrompida.' : 'Sem resposta.'}</span>
                  )}
                </div>
                {message.role === 'assistant' && message.timeline && message.timeline.length > 0 && (
                  <details className="mesp-timeline">
                    <summary>
                      <span>Linha do tempo</span>
                      <small>{message.timeline.length} eventos</small>
                    </summary>
                    <ol>
                      {message.timeline.map((entry) => (
                        <li className={`status-${entry.status}`} key={entry.id}>
                          <span className="mesp-timeline-marker" aria-hidden="true" />
                          <span>{entry.label}</span>
                          <time dateTime={new Date(entry.at).toISOString()}>
                            {new Date(entry.at).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </time>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {message.role === 'assistant' && message.verification && (
                  <section
                    className={`mesp-verification status-${message.verification.status}`}
                    aria-label="Resultado das verificacoes do projeto"
                  >
                    <header>
                      <div>
                        <span className="mesp-verification-indicator" aria-hidden="true" />
                        <strong>Quality gates</strong>
                      </div>
                      <span>
                        {message.verification.status === 'running'
                          ? 'executando'
                          : message.verification.status === 'passed'
                            ? 'aprovado'
                            : message.verification.status === 'cancelled'
                              ? 'interrompido'
                              : 'falhou'}
                      </span>
                    </header>
                    <div className="mesp-verification-checks">
                      {message.verification.checks.map((check) => (
                        <details key={check.name} className={`status-${check.status}`}>
                          <summary>
                            <span className="mesp-verification-check-dot" aria-hidden="true" />
                            <strong>{PROJECT_CHECK_LABELS[check.name]}</strong>
                            <span>
                              {check.status === 'pending'
                                ? 'aguardando'
                                : check.status === 'running'
                                  ? 'executando'
                                  : check.status === 'passed'
                                    ? 'passou'
                                    : check.status === 'cancelled'
                                      ? 'interrompido'
                                      : 'falhou'}
                              {check.timedOut ? ' (tempo esgotado)' : ''}
                              {check.durationMs !== undefined
                                ? ` · ${seconds(check.durationMs)}`
                                : ''}
                            </span>
                          </summary>
                          {check.stdout && (
                            <div className="mesp-verification-output stream-stdout">
                              <span>stdout</span>
                              <pre>{check.stdout}</pre>
                            </div>
                          )}
                          {check.stderr && (
                            <div className="mesp-verification-output stream-stderr">
                              <span>stderr</span>
                              <pre>{check.stderr}</pre>
                            </div>
                          )}
                          {check.output && !check.stdout && !check.stderr && <pre>{check.output}</pre>}
                          {!check.output && !check.stdout && !check.stderr && (
                            <p>Sem saida registrada.</p>
                          )}
                          {check.truncated && (
                            <small>A saida foi limitada para manter o app responsivo.</small>
                          )}
                        </details>
                      ))}
                    </div>
                  </section>
                )}
                {(message.error ||
                  message.status === 'cancelled' ||
                  message.tokens ||
                  message.durationMs ||
                  message.model) && (
                  <footer>
                    {message.error && <span className="mesp-message-error">{message.error}</span>}
                    {message.status === 'cancelled' && <span>interrompido</span>}
                    {message.firstTokenMs !== undefined && (
                      <span>
                        {message.engine === '9router' ? 'primeiro token' : 'primeiro texto'}{' '}
                        {seconds(message.firstTokenMs)}
                      </span>
                    )}
                    {message.durationMs !== undefined && (
                      <span>total {seconds(message.durationMs)}</span>
                    )}
                    {message.tokens ? (
                      <span
                        title={
                          message.inputTokens !== undefined
                            ? `${message.inputTokens.toLocaleString()} entrada · ${(message.outputTokens || 0).toLocaleString()} saida`
                            : undefined
                        }
                      >
                        {message.tokens.toLocaleString()} tokens
                      </span>
                    ) : null}
                    {message.model && (() => {
                      const parts = modelParts(message.model);
                      return <span>{`${parts.provider} · ${parts.name}`}</span>;
                    })()}
                  </footer>
                )}
                {message.role === 'assistant' &&
                  message.status === 'done' &&
                  (message.mode === 'assisted' || message.mode === 'autonomous') &&
                  message.sessionId &&
                  message.messageId && (
                    <div className="mesp-review-actions">
                      <button type="button" onClick={() => void reviewChanges(message)}>
                        {diffReviews[message.id]?.open ? 'Ocultar mudancas' : 'Revisar mudancas'}
                      </button>
                      {message.reverted && <span>Mudancas revertidas</span>}
                    </div>
                  )}
                {message.role === 'assistant' &&
                  message.status === 'done' &&
                  availableChecks.length > 0 &&
                  (!message.cwd || message.cwd === workDir) &&
                  message.verification?.status !== 'running' && (
                    <div className="mesp-verification-actions">
                      <button
                        type="button"
                        onClick={() => void runVerification(message)}
                        disabled={occupied || selectedChecks.length === 0}
                      >
                        {message.verification ? 'Verificar novamente' : 'Verificar projeto'}
                      </button>
                    </div>
                  )}
                {diffReviews[message.id]?.open && (
                  <section className="mesp-diff-review" aria-label="Mudancas da sessao">
                    {diffReviews[message.id].loading && <p>Carregando mudancas...</p>}
                    {diffReviews[message.id].error && (
                      <p className="mesp-message-error">{diffReviews[message.id].error}</p>
                    )}
                    {!diffReviews[message.id].loading &&
                      !diffReviews[message.id].error &&
                      diffReviews[message.id].files.length === 0 && <p>Nenhum arquivo alterado.</p>}
                    {diffReviews[message.id].files.map((file) => (
                      <details className="mesp-diff-file" key={file.file}>
                        <summary>
                          <span>{file.file}</span>
                          <small>
                            <b>+{file.additions}</b> <i>-{file.deletions}</i>
                          </small>
                        </summary>
                        {file.patch ? <pre>{file.patch}</pre> : <p>Diff textual indisponivel.</p>}
                      </details>
                    ))}
                    {diffReviews[message.id].truncated && (
                      <p>O diff foi limitado para manter a interface responsiva.</p>
                    )}
                    {diffReviews[message.id].files.length > 0 &&
                      message.messageId &&
                      !message.reverted && (
                        <button
                          type="button"
                          className="mesp-revert-trigger"
                          onClick={() => setRevertMessage(message)}
                        >
                          Reverter esta etapa
                        </button>
                      )}
                  </section>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <form
        className="mesp-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={
            occupied
              ? 'Descreva outra tarefa para adicionar a fila...'
              : mode === 'fast'
              ? 'Pergunte sem carregar as ferramentas do agente...'
              : mode === 'plan'
                ? 'Peca uma analise e um plano sem alterar o projeto...'
                : mode === 'assisted'
                  ? 'Descreva a tarefa; o MESP pedira aprovacao antes de agir...'
                  : 'Descreva o objetivo; o MESP executa ate concluir...'
          }
          aria-label="Mensagem para o MESP"
          rows={3}
        />
        <div className="mesp-composer-footer">
          <span className="mesp-composer-context" title={workDir || 'Diretorio atual'}>
            {workDir?.split(/[\\/]/).filter(Boolean).pop() || 'diretorio atual'}
          </span>
          <span className="mesp-composer-hint">
            {occupied ? 'Enter adiciona a fila' : 'Enter envia'} · Shift+Enter quebra linha
          </span>
          {occupied ? (
            <div className="mesp-composer-actions">
              <button
                type="button"
                className="mesp-composer-stop"
                onClick={() => void cancel()}
                disabled={cancelling}
              >
                <span aria-hidden="true">■</span>{' '}
                {cancelling
                  ? 'Parando...'
                  : verifyingMessageId || pendingAutoVerify
                    ? 'Parar verificacao'
                    : 'Parar'}
              </button>
              <button
                type="submit"
                className="mesp-composer-queue"
                disabled={
                  !input.trim() ||
                  !effectiveModel ||
                  status?.runtime?.setupRequired ||
                  queue.length >= 10
                }
              >
                Adicionar a fila
              </button>
            </div>
          ) : (
            <button
              type="submit"
              className="mesp-composer-send"
              disabled={!input.trim() || !effectiveModel || status?.runtime?.setupRequired}
            >
              Enviar <span aria-hidden="true">↑</span>
            </button>
          )}
        </div>
      </form>

      <div className="mesp-sr-announcement" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {permission && (
        <div className="mesp-access-backdrop" role="presentation">
          <div
            className="mesp-access-dialog mesp-permission-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mesp-permission-title"
            aria-describedby="mesp-permission-description"
          >
            <span className="mesp-access-icon supervised" aria-hidden="true">
              ?
            </span>
            <p className="mesp-chat-eyebrow">Aprovacao necessaria</p>
            <h2 id="mesp-permission-title">
              Permitir {permission.tool || permission.action}?
            </h2>
            <p id="mesp-permission-description">
              O MESP pausou antes de executar esta acao. Revise os recursos envolvidos e escolha o
              alcance da permissao.
            </p>
            {permission.resources.length > 0 && (
              <div className="mesp-permission-resources">
                {permission.resources.map((resource, index) => (
                  <code key={`${resource}-${index}`}>{resource}</code>
                ))}
              </div>
            )}
            <div className="mesp-access-actions mesp-permission-actions">
              <button
                type="button"
                onClick={() => void replyPermission('reject')}
                disabled={permissionReplying}
                autoFocus
              >
                Negar
              </button>
              <button
                type="button"
                onClick={() => void replyPermission('once')}
                disabled={permissionReplying}
              >
                Permitir uma vez
              </button>
              <button
                type="button"
                className="supervised"
                onClick={() => void replyPermission('always')}
                disabled={permissionReplying}
              >
                Permitir na sessao
              </button>
            </div>
          </div>
        </div>
      )}

      {revertMessage && (
        <div className="mesp-access-backdrop" role="presentation">
          <div
            className="mesp-access-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mesp-revert-title"
            aria-describedby="mesp-revert-description"
          >
            <span className="mesp-access-icon" aria-hidden="true">
              !
            </span>
            <p className="mesp-chat-eyebrow">Reversao de arquivos</p>
            <h2 id="mesp-revert-title">Reverter as mudancas desta etapa?</h2>
            <p id="mesp-revert-description">
              O OpenCode restaurara os arquivos modificados a partir desta resposta. Alteracoes
              posteriores na mesma sessao tambem podem ser afetadas.
            </p>
            <div className="mesp-access-actions">
              <button type="button" onClick={() => setRevertMessage(null)} disabled={reverting} autoFocus>
                Cancelar
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void confirmRevert()}
                disabled={reverting}
              >
                {reverting ? 'Revertendo...' : 'Reverter arquivos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAutonomous && (
        <div className="mesp-access-backdrop" role="presentation">
          <div
            className="mesp-access-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mesp-access-title"
            aria-describedby="mesp-access-description"
          >
            <span className="mesp-access-icon" aria-hidden="true">
              !
            </span>
            <p className="mesp-chat-eyebrow">Acesso total</p>
            <h2 id="mesp-access-title">Ativar modo Autonomo?</h2>
            <p id="mesp-access-description">
              O MESP podera ler e editar qualquer arquivo acessivel, executar comandos e continuar
              sem pedir confirmacao. Use apenas em um projeto confiavel.
            </p>
            <div className="mesp-access-actions">
              <button type="button" onClick={() => setConfirmAutonomous(false)} autoFocus>
                Cancelar
              </button>
              <button type="button" className="danger" onClick={acceptAutonomous}>
                Ativar acesso total
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
