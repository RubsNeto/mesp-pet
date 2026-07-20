// Pure helpers shared by the Electron bridge and its Node test suite.

export const MESP_CODE_MODES = Object.freeze(['fast', 'plan', 'assisted', 'autonomous']);
export const PROJECT_CHECK_NAMES = Object.freeze(['typecheck', 'lint', 'test', 'build', 'check']);

export function isMespCodeMode(value) {
  return MESP_CODE_MODES.includes(value);
}

export function resolveOpenCodeConfigValue(value, environment = {}) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const reference = trimmed.match(/^\{env:([A-Z_][A-Z0-9_]*)\}$/);
  if (!reference) return /^\{env:/i.test(trimmed) ? null : trimmed;
  const resolved = environment?.[reference[1]];
  return typeof resolved === 'string' && resolved.trim() ? resolved.trim() : null;
}

export function parseDotEnvValue(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote) {
      const inner = trimmed.slice(1, -1);
      return quote === '"'
        ? inner
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
        : inner;
    }
  }
  return trimmed.replace(/\s+#.*$/, '').trimEnd();
}

const LOOPBACK_ROUTER_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isLoopbackRouterURL(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new globalThis.URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      LOOPBACK_ROUTER_HOSTS.has(hostname)
    );
  } catch {
    return false;
  }
}

export function routerOriginForApiBase(value) {
  if (!isLoopbackRouterURL(value)) return null;
  try {
    return new globalThis.URL(value).origin;
  } catch {
    return null;
  }
}

export function hasActiveRouterConnections(payload) {
  const connections =
    payload && typeof payload === 'object' && Array.isArray(payload.connections)
      ? payload.connections
      : null;
  if (!connections) return null;
  return connections.some(
    (connection) =>
      connection && typeof connection === 'object' && connection.isActive !== false,
  );
}

export function extractOpenCodeApiCredential(authConfig, providerId) {
  let parsed = authConfig;
  if (typeof authConfig === 'string') {
    try {
      parsed = JSON.parse(authConfig);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const credential = parsed[providerId];
  if (!credential || typeof credential !== 'object' || Array.isArray(credential)) return null;
  if (credential.type !== 'api' || typeof credential.key !== 'string') return null;
  return credential.key.trim() || null;
}

export function discoverProjectChecks(packageJson) {
  let parsed = packageJson;
  if (typeof packageJson === 'string') {
    try {
      parsed = JSON.parse(packageJson);
    } catch {
      return [];
    }
  }
  const scripts = parsed && typeof parsed === 'object' ? parsed.scripts : null;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return [];
  return PROJECT_CHECK_NAMES.filter(
    (name) => typeof scripts[name] === 'string' && scripts[name].trim().length > 0,
  );
}

export function normalizeProjectChecks(requested, available) {
  if (!Array.isArray(requested) || requested.length === 0 || !Array.isArray(available)) return null;
  const availableSet = new Set(available);
  const selected = new Set();
  for (const check of requested) {
    if (
      typeof check !== 'string' ||
      !PROJECT_CHECK_NAMES.includes(check) ||
      !availableSet.has(check)
    ) {
      return null;
    }
    selected.add(check);
  }
  return PROJECT_CHECK_NAMES.filter((check) => selected.has(check));
}

export function createBoundedProjectCheckOutput(maxBytes = 160_000) {
  const limit = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 0;
  const encoder = new globalThis.TextEncoder();
  const decoder = new globalThis.TextDecoder();
  const output = { stdout: '', stderr: '' };
  let bytes = 0;
  let truncated = false;

  return {
    append(stream, chunk) {
      if (stream !== 'stdout' && stream !== 'stderr') return;
      const encoded = encoder.encode(String(chunk ?? ''));
      const remaining = limit - bytes;
      if (remaining <= 0) {
        if (encoded.length > 0) truncated = true;
        return;
      }
      const accepted = encoded.subarray(0, remaining);
      output[stream] += decoder.decode(accepted);
      bytes += accepted.length;
      if (accepted.length < encoded.length) truncated = true;
    },
    snapshot() {
      return { ...output, bytes, truncated };
    },
  };
}

export function enqueueUniqueTask(queue, task, limit = 10) {
  const current = Array.isArray(queue) ? queue : [];
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (!task || typeof task !== 'object' || typeof task.id !== 'string') {
    return { queue: current, added: false, reason: 'invalid' };
  }
  if (current.some((item) => item && item.id === task.id)) {
    return { queue: current, added: false, reason: 'duplicate' };
  }
  if (current.length >= safeLimit) {
    return { queue: current, added: false, reason: 'full' };
  }
  return { queue: [...current, task], added: true };
}

export function takeNextQueuedTask(queue, options = {}) {
  const current = Array.isArray(queue) ? queue : [];
  if (options.paused || options.occupied || current.length === 0) {
    return { queue: current, task: null };
  }
  return { queue: current.slice(1), task: current[0] };
}

export function shouldPauseQueueAfterVerification({
  automatic,
  passed,
  cancelled,
  pendingCount,
}) {
  return Boolean(automatic && !passed && !cancelled && pendingCount > 0);
}

export function projectCheckFinalState({ cancelled, stopped = false, results, expectedCount }) {
  if (cancelled) return { status: 'cancelled', passed: false, cancelled: true };
  const items = Array.isArray(results) ? results : [];
  const passed =
    Number.isInteger(expectedCount) &&
    expectedCount >= 0 &&
    !stopped &&
    items.length === expectedCount &&
    items.every((item) => item && item.code === 0);
  return { status: passed ? 'passed' : 'failed', passed, cancelled: false };
}

const TIMELINE_KINDS = new Set(['run', 'permission', 'tool', 'verification']);
const TIMELINE_STATUSES = new Set(['pending', 'running', 'success', 'error', 'cancelled']);
const MESSAGE_STATUSES = new Set(['streaming', 'done', 'error', 'cancelled']);
const VERIFICATION_STATUSES = new Set(['running', 'passed', 'failed', 'cancelled']);
const CHECK_STATUSES = new Set(['pending', 'running', 'passed', 'failed', 'cancelled']);

function optionalFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeStoredTimeline(value) {
  if (!Array.isArray(value)) return undefined;
  const timeline = value
    .filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.label === 'string' &&
        TIMELINE_KINDS.has(entry.kind) &&
        TIMELINE_STATUSES.has(entry.status) &&
        optionalFiniteNumber(entry.at) !== undefined,
    )
    .slice(-32)
    .map((entry) => ({
      id: entry.id.slice(0, 200),
      kind: entry.kind,
      label: entry.label.slice(0, 2_000),
      status: entry.status,
      at: entry.at,
    }))
    .sort((left, right) => left.at - right.at);
  return timeline.length > 0 ? timeline : undefined;
}

function normalizeStoredVerification(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string') return undefined;
  if (!VERIFICATION_STATUSES.has(value.status) || !Array.isArray(value.checks)) return undefined;
  const wasRunning = value.status === 'running';
  const checks = value.checks
    .filter(
      (check) =>
        check &&
        typeof check === 'object' &&
        PROJECT_CHECK_NAMES.includes(check.name) &&
        CHECK_STATUSES.has(check.status),
    )
    .slice(0, PROJECT_CHECK_NAMES.length)
    .map((check) => ({
      name: check.name,
      status:
        wasRunning && (check.status === 'pending' || check.status === 'running')
          ? 'cancelled'
          : check.status,
      ...(check.code === null || Number.isInteger(check.code) ? { code: check.code } : {}),
      ...(optionalFiniteNumber(check.durationMs) === undefined
        ? {}
        : { durationMs: check.durationMs }),
      output: typeof check.output === 'string' ? check.output.slice(-24_000) : '',
      ...(typeof check.stdout === 'string' ? { stdout: check.stdout.slice(-12_000) } : {}),
      ...(typeof check.stderr === 'string' ? { stderr: check.stderr.slice(-12_000) } : {}),
      ...(check.timedOut === true ? { timedOut: true } : {}),
      ...(check.truncated === true ? { truncated: true } : {}),
    }));
  if (checks.length === 0) return undefined;
  return {
    id: value.id.slice(0, 200),
    status: wasRunning ? 'cancelled' : value.status,
    checks,
  };
}

export function normalizeStoredMespMessages(value, limit = 80) {
  if (!Array.isArray(value)) return [];
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  return value
    .filter(
      (message) =>
        message &&
        typeof message === 'object' &&
        typeof message.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.text === 'string',
    )
    .slice(-safeLimit)
    .map((message) => {
      const rawStatus = MESSAGE_STATUSES.has(message.status) ? message.status : 'done';
      const normalized = {
        id: message.id.slice(0, 200),
        role: message.role,
        text: message.text.slice(0, 240_000),
        tools: Array.isArray(message.tools)
          ? message.tools.filter((tool) => typeof tool === 'string').slice(-8)
          : [],
        status: rawStatus === 'streaming' ? 'cancelled' : rawStatus,
      };
      for (const key of ['error', 'mode', 'model', 'engine', 'sessionId', 'messageId']) {
        if (typeof message[key] === 'string') normalized[key] = message[key].slice(0, 4_096);
      }
      if (typeof message.cwd === 'string' || message.cwd === null) normalized.cwd = message.cwd;
      for (const key of ['tokens', 'inputTokens', 'outputTokens', 'durationMs', 'firstTokenMs']) {
        const number = optionalFiniteNumber(message[key]);
        if (number !== undefined) normalized[key] = number;
      }
      if (message.reverted === true) normalized.reverted = true;
      const timeline = normalizeStoredTimeline(message.timeline);
      if (timeline) normalized.timeline = timeline;
      const verification = normalizeStoredVerification(message.verification);
      if (verification) normalized.verification = verification;
      return normalized;
    });
}

export function normalizeStoredMespQueue(value, limit = 10) {
  if (!Array.isArray(value)) return [];
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const seen = new Set();
  const queue = [];
  for (const task of value) {
    if (
      !task ||
      typeof task !== 'object' ||
      typeof task.id !== 'string' ||
      seen.has(task.id) ||
      typeof task.prompt !== 'string' ||
      task.prompt.length === 0 ||
      task.prompt.length > 24_000 ||
      !isMespCodeMode(task.mode) ||
      typeof task.model !== 'string' ||
      !task.model.startsWith('9router/') ||
      !task.limits ||
      typeof task.limits !== 'object'
    ) {
      continue;
    }
    seen.add(task.id);
    queue.push({
      id: task.id.slice(0, 200),
      prompt: task.prompt,
      mode: task.mode,
      model: task.model.slice(0, 256),
      limits: {
        maxDurationMs: optionalFiniteNumber(task.limits.maxDurationMs) ?? 300_000,
        maxTokens: optionalFiniteNumber(task.limits.maxTokens) ?? 25_000,
        maxToolCalls: optionalFiniteNumber(task.limits.maxToolCalls) ?? 50,
      },
      cwd: typeof task.cwd === 'string' ? task.cwd.slice(0, 4_096) : null,
      createdAt: optionalFiniteNumber(task.createdAt) ?? Date.now(),
    });
    if (queue.length >= safeLimit) break;
  }
  return queue;
}

export function buildOpenCodeArgs({ prompt, model, sessionId = null, mode }) {
  if (mode !== 'plan' && mode !== 'autonomous') {
    throw new Error('OpenCode arguments require plan or autonomous mode');
  }
  const args = ['run', '--format', 'json', '--model', model];
  if (mode === 'plan') {
    args.push('--agent', 'mesp-plan');
  } else {
    args.push('--agent', 'mesp-autonomous', '--auto');
  }
  if (sessionId) args.push('--session', sessionId);
  else args.push('--title', 'MESP Code');
  args.push(prompt);
  return args;
}

export function modelIdFor9Router(model) {
  return String(model || '').replace(/^9router\//, '');
}

export function buildFastMessages(history, prompt, options = {}) {
  const maxMessages = Math.max(0, options.maxMessages ?? 8);
  const maxChars = Math.max(0, options.maxChars ?? 12000);
  const clean = Array.isArray(history)
    ? history
        .filter(
          (item) =>
            item &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string' &&
            item.content.trim(),
        )
        .map((item) => ({ role: item.role, content: item.content.trim() }))
        .slice(-maxMessages)
    : [];

  let used = String(prompt).length;
  const selected = [];
  for (let index = clean.length - 1; index >= 0; index -= 1) {
    const item = clean[index];
    if (used + item.content.length > maxChars) break;
    selected.unshift(item);
    used += item.content.length;
  }

  return [
    {
      role: 'system',
      content:
        'Voce e o MESP, um assistente de programacao direto e pratico. Responda em portugues. Neste modo rapido voce nao le nem altera arquivos; deixe isso claro quando a tarefa exigir acesso ao projeto.',
    },
    ...selected,
    { role: 'user', content: String(prompt).trim() },
  ];
}

export function parseOpenAIStreamData(data) {
  const trimmed = String(data || '').trim();
  if (!trimmed || trimmed === '[DONE]') return { done: trimmed === '[DONE]' };
  let event;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return {};
  }
  const choice = Array.isArray(event.choices) ? event.choices[0] : null;
  const delta = choice && choice.delta && typeof choice.delta === 'object' ? choice.delta : null;
  const message =
    choice && choice.message && typeof choice.message === 'object' ? choice.message : null;
  const text =
    (delta && typeof delta.content === 'string' && delta.content) ||
    (message && typeof message.content === 'string' && message.content) ||
    (typeof event.output_text === 'string' && event.output_text) ||
    (typeof event.delta === 'string' && event.delta) ||
    '';
  const usage = event.usage && typeof event.usage === 'object' ? event.usage : undefined;
  const rawError = event.error;
  const error =
    (typeof rawError === 'string' && rawError) ||
    (rawError &&
      typeof rawError === 'object' &&
      typeof rawError.message === 'string' &&
      rawError.message) ||
    undefined;
  return { text, usage, error, done: choice?.finish_reason != null };
}

export function extractSSEData(buffer, final = false) {
  const source = String(buffer || '');
  const data = [];
  const separator = /\r\n\r\n|\n\n|\r\r/g;
  let start = 0;
  let match;

  const collect = (block) => {
    const lines = block.split(/\r\n|\n|\r/);
    const dataLines = [];
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
    if (dataLines.length > 0) data.push(dataLines.join('\n'));
  };

  while ((match = separator.exec(source)) !== null) {
    collect(source.slice(start, match.index));
    start = match.index + match[0].length;
  }

  const remainder = source.slice(start);
  if (final && remainder.trim()) collect(remainder);
  return { data, remainder: final ? '' : remainder };
}

export function totalTokensFromUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined;
  if (typeof usage.total_tokens === 'number') return usage.total_tokens;
  const input =
    typeof usage.prompt_tokens === 'number'
      ? usage.prompt_tokens
      : typeof usage.input_tokens === 'number'
        ? usage.input_tokens
        : 0;
  const output =
    typeof usage.completion_tokens === 'number'
      ? usage.completion_tokens
      : typeof usage.output_tokens === 'number'
        ? usage.output_tokens
        : 0;
  return input || output ? input + output : undefined;
}

function finiteTokenCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function tokenUsageFromOpenCodeEvent(event) {
  if (!event || typeof event !== 'object') return undefined;
  const part = event.part && typeof event.part === 'object' ? event.part : null;
  const tokens = part && part.tokens && typeof part.tokens === 'object' ? part.tokens : null;
  if (!tokens) return undefined;

  const input = finiteTokenCount(tokens.input);
  const output = finiteTokenCount(tokens.output);
  const cache = tokens.cache && typeof tokens.cache === 'object' ? tokens.cache : null;
  const cacheRead = finiteTokenCount(cache?.read);
  const cacheWrite = finiteTokenCount(cache?.write);
  const reportedTotal = finiteTokenCount(tokens.total);
  const values = [input, output, cacheRead, cacheWrite];
  const total =
    reportedTotal ??
    (values.some((value) => value !== undefined)
      ? values.reduce((sum, value) => sum + (value ?? 0), 0)
      : undefined);
  if (total === undefined) return undefined;
  return { total, input, output };
}

export function addTokenUsage(current, next) {
  if (!next) return current;
  if (!current) return { ...next };
  const addOptional = (left, right) =>
    left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0);
  return {
    total: current.total + next.total,
    input: addOptional(current.input, next.input),
    output: addOptional(current.output, next.output),
  };
}

export function publicOpenCodeEvent(event) {
  if (!event || typeof event !== 'object') return {};
  const result = {};
  for (const key of ['type', 'timestamp', 'sessionID', 'text']) {
    const value = event[key];
    if (typeof value === 'string' || typeof value === 'number') result[key] = value;
  }

  const part = event.part && typeof event.part === 'object' ? event.part : null;
  if (!part) return result;
  const publicPart = {};
  for (const key of ['id', 'messageID', 'callID', 'type', 'text', 'tool', 'name']) {
    const value = part[key];
    if (typeof value === 'string') publicPart[key] = value;
  }
  const state = part.state && typeof part.state === 'object' ? part.state : null;
  if (state && typeof state.status === 'string') {
    publicPart.state = { status: state.status };
  }
  const tokens = part.tokens && typeof part.tokens === 'object' ? part.tokens : null;
  if (tokens) {
    const publicTokens = {};
    for (const key of ['total', 'input', 'output', 'reasoning']) {
      const value = finiteTokenCount(tokens[key]);
      if (value !== undefined) publicTokens[key] = value;
    }
    const cache = tokens.cache && typeof tokens.cache === 'object' ? tokens.cache : null;
    if (cache) {
      const read = finiteTokenCount(cache.read);
      const write = finiteTokenCount(cache.write);
      if (read !== undefined || write !== undefined) {
        publicTokens.cache = { ...(read === undefined ? {} : { read }), ...(write === undefined ? {} : { write }) };
      }
    }
    publicPart.tokens = publicTokens;
  }
  result.part = publicPart;
  return result;
}
