import { PROVIDER_CATALOG } from './dockProviderCatalog.mjs';

export const AUTO_ROUTER_MODEL = '9router/mesp-auto';
export const ROUTER_THEME_CSS = `
  :root, .dark { color-scheme: dark; --background: #000; --foreground: #f5f6f8;
    --card: #141518; --card-foreground: #f5f6f8; --popover: #17181b; --popover-foreground: #f5f6f8;
    --primary: #eeeeef; --primary-foreground: #111; --secondary: #202125; --secondary-foreground: #eee;
    --muted: #202125; --muted-foreground: #a8adb7; --accent: #25262a; --accent-foreground: #eee;
    --border: #292a2e; --input: #292a2e; --ring: #a8adb7; --radius: 0.8rem;
    --color-primary: #eeeeef; --color-background: #000; --color-surface: #141518; }
  :root, .dark {
    --color-bg: #000; --color-bg-alt: #0b0b0c; --color-surface-2: #202125; --color-surface-3: #292a2e;
    --color-sidebar: #0b0b0c; --color-border: #292a2e; --color-border-subtle: #202125;
    --color-text: #f5f6f8; --color-text-main: #f5f6f8; --color-text-muted: #a8adb7; --color-text-subtle: #9398a1;
    --color-primary-hover: #d5d9e1; --color-brand-50: #f6f6f7; --color-brand-100: #e8e9ec;
    --color-brand-200: #dadce1; --color-brand-300: #c0c3ca; --color-brand-400: #a8adb7;
    --color-brand-500: #e8e9ec; --color-brand-600: #d5d9e1; --color-brand-700: #636770;
    --color-brand-800: #393c43; --color-brand-900: #202125; --shadow-focus: 0 0 0 2px #636770;
  }
  aside a[href="/dashboard"] > div:first-child { background: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiIgc2hhcGUtcmVuZGVyaW5nPSJjcmlzcEVkZ2VzIj48cmVjdCB4PSIxNiIgeT0iNiIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjE1IiB5PSI3IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iMTYiIHk9IjciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNiNmVjZmYiLz48cmVjdCB4PSIxNyIgeT0iNyIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjE1IiB5PSI4IiB3aWR0aD0iMyIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iMTAiIHk9IjkiIHdpZHRoPSIxMiIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iOCIgeT0iMTAiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iNyIgeT0iMTEiIHdpZHRoPSI3IiBoZWlnaHQ9IjEiIGZpbGw9IiM2ZmNmZWUiLz48cmVjdCB4PSIxNCIgeT0iMTEiIHdpZHRoPSI0IiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmZmZmYiLz48cmVjdCB4PSIxOCIgeT0iMTEiIHdpZHRoPSI3IiBoZWlnaHQ9IjEiIGZpbGw9IiM2ZmNmZWUiLz48cmVjdCB4PSI2IiB5PSIxMiIgd2lkdGg9IjciIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjEzIiB5PSIxMiIgd2lkdGg9IjYiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZmZmZiIvPjxyZWN0IHg9IjE5IiB5PSIxMiIgd2lkdGg9IjciIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjYiIHk9IjEzIiB3aWR0aD0iNiIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iMTIiIHk9IjEzIiB3aWR0aD0iOCIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmZmZmIi8+PHJlY3QgeD0iMjAiIHk9IjEzIiB3aWR0aD0iNiIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iNSIgeT0iMTQiIHdpZHRoPSI3IiBoZWlnaHQ9IjEiIGZpbGw9IiM2ZmNmZWUiLz48cmVjdCB4PSIxMiIgeT0iMTQiIHdpZHRoPSI4IiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmZmZmYiLz48cmVjdCB4PSIyMCIgeT0iMTQiIHdpZHRoPSI3IiBoZWlnaHQ9IjEiIGZpbGw9IiM2ZmNmZWUiLz48cmVjdCB4PSI1IiB5PSIxNSIgd2lkdGg9IjciIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjEyIiB5PSIxNSIgd2lkdGg9IjgiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZmZmZiIvPjxyZWN0IHg9IjIwIiB5PSIxNSIgd2lkdGg9IjciIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjUiIHk9IjE2IiB3aWR0aD0iNyIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iMTIiIHk9IjE2IiB3aWR0aD0iOCIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmZmZmIi8+PHJlY3QgeD0iMjAiIHk9IjE2IiB3aWR0aD0iNyIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iNSIgeT0iMTciIHdpZHRoPSI4IiBoZWlnaHQ9IjEiIGZpbGw9IiM2ZmNmZWUiLz48cmVjdCB4PSIxMyIgeT0iMTciIHdpZHRoPSI2IiBoZWlnaHQ9IjEiIGZpbGw9IiNmZmZmZmYiLz48cmVjdCB4PSIxOSIgeT0iMTciIHdpZHRoPSI4IiBoZWlnaHQ9IjEiIGZpbGw9IiM2ZmNmZWUiLz48cmVjdCB4PSI1IiB5PSIxOCIgd2lkdGg9IjkiIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjE0IiB5PSIxOCIgd2lkdGg9IjQiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZmZmZiIvPjxyZWN0IHg9IjE4IiB5PSIxOCIgd2lkdGg9IjkiIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjUiIHk9IjE5IiB3aWR0aD0iMjIiIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjUiIHk9IjIwIiB3aWR0aD0iMjIiIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjUiIHk9IjIxIiB3aWR0aD0iMjIiIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjUiIHk9IjIyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjM2E4ZmI4Ii8+PHJlY3QgeD0iNiIgeT0iMjIiIHdpZHRoPSIyMCIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iMjYiIHk9IjIyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjM2E4ZmI4Ii8+PHJlY3QgeD0iNiIgeT0iMjMiIHdpZHRoPSIyMCIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iNiIgeT0iMjQiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMzYThmYjgiLz48cmVjdCB4PSI3IiB5PSIyNCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjEiIGZpbGw9IiM2ZmNmZWUiLz48cmVjdCB4PSIyNSIgeT0iMjQiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMzYThmYjgiLz48cmVjdCB4PSI3IiB5PSIyNSIgd2lkdGg9IjUiIGhlaWdodD0iMSIgZmlsbD0iIzNhOGZiOCIvPjxyZWN0IHg9IjEyIiB5PSIyNSIgd2lkdGg9IjgiIGhlaWdodD0iMSIgZmlsbD0iIzZmY2ZlZSIvPjxyZWN0IHg9IjIwIiB5PSIyNSIgd2lkdGg9IjUiIGhlaWdodD0iMSIgZmlsbD0iIzNhOGZiOCIvPjxyZWN0IHg9IjciIHk9IjI2IiB3aWR0aD0iNiIgaGVpZ2h0PSIxIiBmaWxsPSIjM2E4ZmI4Ii8+PHJlY3QgeD0iMTMiIHk9IjI2IiB3aWR0aD0iNiIgaGVpZ2h0PSIxIiBmaWxsPSIjNmZjZmVlIi8+PHJlY3QgeD0iMTkiIHk9IjI2IiB3aWR0aD0iNiIgaGVpZ2h0PSIxIiBmaWxsPSIjM2E4ZmI4Ii8+PHJlY3QgeD0iNyIgeT0iMjciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxIiBmaWxsPSIjM2E4ZmI4Ii8+PHJlY3QgeD0iOCIgeT0iMjgiIHdpZHRoPSI0IiBoZWlnaHQ9IjEiIGZpbGw9IiMzYThmYjgiLz48cmVjdCB4PSIyMCIgeT0iMjgiIHdpZHRoPSI0IiBoZWlnaHQ9IjEiIGZpbGw9IiMzYThmYjgiLz48cmVjdCB4PSIxNSIgeT0iMTQiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9IiMxMDEzMWEiLz48cmVjdCB4PSIxNSIgeT0iMTQiIHdpZHRoPSIuNSIgaGVpZ2h0PSIuNSIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==") center / 44px 44px no-repeat !important; width:44px; height:44px; }
  aside a[href="/dashboard"] > div:first-child > * { visibility:hidden; }
  aside a[href="/dashboard"] h1 { font-size:0 !important; }
  aside a[href="/dashboard"] h1::before { content:'MESP'; font-size:19px; font-weight:650; }
  aside > div:first-child:has([class*="bg-[#FF5F56]"]) { display:none; }
  .landing-grid, .dot-grid-bg { background-image:none !important; }
  [class*="border-pink"] { border-color:#38393e !important; }
  [class*="bg-pink"], [class*="bg-amber"], [class*="bg-green-600"] { background-color:#25262a !important; color:#eee !important; }
  [class*="text-pink"], [class*="text-amber"] { color:#a8adb7 !important; }
  html, body { background: #000 !important; color: #f5f6f8 !important; font-family: 'Segoe UI', sans-serif !important; }
  aside, header, nav { background-color: #0b0b0c !important; border-color: #292a2e !important; }
  main { background-color: #000 !important; }
  [class*="border-primary"], [class*="border-orange"], [class*="border-blue"], [class*="border-green"] { border-color: #38393e !important; }
  [class*="bg-primary"], [class*="bg-orange-"], [class*="bg-blue-600"], [class*="bg-purple-600"] { background-color: #e8e9ec !important; color: #111 !important; }
  [class*="bg-primary/"], [class*="bg-orange-"][class*="/"], [class*="bg-brand-"] { background-color: #25262a !important; color: #eee !important; }
  [class*="text-primary"], [class*="text-orange-"], [class*="text-purple-"] { color: #e8e9ec !important; }
  button, input, select { border-radius: 9px !important; }
  input, select, textarea { color-scheme: dark; }
  button:focus-visible, a:focus-visible, input:focus-visible { outline-color: #a8adb7 !important; }
  [class*="shadow"] { box-shadow: none !important; }
`;
export const ROUTER_PERIODS = ['today', '7d', '30d', 'all'];
const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
const clean = (value, fallback = '') =>
  typeof value === 'string'
    ? Array.from(value)
        .filter((char) => char.charCodeAt(0) >= 32 && char !== '<' && char !== '>')
        .join('')
        .trim()
        .slice(0, 120)
    : fallback;
const validModel = (id) => typeof id === 'string' && /^[A-Za-z0-9._/+:-]{1,240}$/.test(id);
const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(id);

export function providerName(provider) {
  return PROVIDER_CATALOG[provider]?.name || provider;
}

export function normalizeRouterQuotas(payload) {
  return Object.entries(object(object(payload).quotas)).flatMap(([key, raw]) => {
    const quota = object(raw);
    const used = number(quota.used),
      total = number(quota.total),
      remaining = number(quota.remaining);
    const usedPercent =
      total > 0 && used !== null
        ? Math.min(100, (used / total) * 100)
        : number(quota.remainingPercentage) !== null
          ? Math.max(0, 100 - quota.remainingPercentage)
          : null;
    const rawReset = quota.resetAt;
    const reset =
      typeof rawReset === 'number'
        ? rawReset < 1e12
          ? rawReset * 1000
          : rawReset
        : typeof rawReset === 'string'
          ? Date.parse(rawReset)
          : NaN;
    if (usedPercent === null && remaining === null && !quota.unlimited) return [];
    return [
      {
        key: clean(key),
        used,
        total,
        remaining,
        usedPercent,
        resetAt: Number.isFinite(reset) ? reset : null,
        unlimited: quota.unlimited === true,
      },
    ];
  });
}

function quotaApplies(key, model) {
  const label = key.toLowerCase(),
    name = model.toLowerCase();
  if (label.includes('review')) return name.endsWith('-review');
  for (const family of ['sonnet', 'opus', 'haiku', 'flash', 'pro']) {
    if (new RegExp(`(?:^|[ _(/-])${family}(?:$|[ _)/-])`).test(label)) return name.includes(family);
  }
  if (/^(?:gemini|gpt|claude)[-/]/.test(label)) return name.includes(label.split(' ')[0]);
  return true;
}

export function autoRouterCandidates(accounts, models, now = Date.now()) {
  const choices = [];
  for (const account of accounts) {
    if (!account.active || account.health === 'auth' || account.health === 'error') continue;
    for (const model of models) {
      if (
        !model.accountIds.includes(account.id) ||
        /(?:-review$|embed|image|tts|whisper|search|fetch)/i.test(model.id)
      )
        continue;
      const name = model.id.replace(/^9router\/[^/]+\//, '');
      if (
        account.locks.some(
          (lock) => lock.until > now && (lock.model === 'all' || lock.model === name),
        )
      )
        continue;
      const quotas = account.quotas.filter((q) => quotaApplies(q.key, name));
      if (
        account.limitReached ||
        quotas.some((q) => !q.unlimited && (q.remaining === 0 || q.usedPercent >= 100))
      )
        continue;
      const resets = quotas.filter((q) => !q.unlimited && q.resetAt > now).map((q) => q.resetAt);
      const resetAt = resets.length ? Math.min(...resets) : null;
      const remaining = quotas.map((q) => (q.usedPercent === null ? 100 : 100 - q.usedPercent));
      const capacity = remaining.length ? Math.min(...remaining) : 100;
      // Reset has precedence; coding ability only chooses among models of that account.
      const quality =
        account.provider === 'github' && name === 'gpt-4.1'
          ? 6 // The native Copilot chat endpoint supports this coding model.
          : /codex/.test(name)
            ? 5
            : /opus|sonnet|gpt-[5-9]|gemini.*pro|coder/.test(name)
              ? 4
              : /haiku|flash|mini/.test(name)
                ? 2
                : 3;
      choices.push({
        model: model.id,
        accountId: account.id,
        accountLabel: account.label,
        provider: account.provider,
        resetAt,
        capacity,
        quality,
        quotaKnown: quotas.length > 0,
        live: model.source === 'live',
      });
    }
  }
  return choices.sort(
    (a, b) =>
      (a.resetAt ?? Infinity) - (b.resetAt ?? Infinity) ||
      Number(b.live) - Number(a.live) ||
      a.accountId.localeCompare(b.accountId) ||
      b.quality - a.quality ||
      b.capacity - a.capacity ||
      b.model.localeCompare(a.model),
  );
}

export function normalizeRouterStats(payload) {
  const stats = object(payload);
  if (number(stats.totalRequests) === null) return null;
  const counters = (raw, overall = false) => {
    const item = object(raw);
    const input = number(item[overall ? 'totalPromptTokens' : 'promptTokens']) || 0;
    const output = number(item[overall ? 'totalCompletionTokens' : 'completionTokens']) || 0;
    return {
      requests: number(item[overall ? 'totalRequests' : 'requests']) || 0,
      inputTokens: input,
      outputTokens: output,
      tokens: input + output,
      cachedTokens: number(item[overall ? 'totalCachedTokens' : 'cachedTokens']) || 0,
      cost: number(item[overall ? 'totalCost' : 'cost']),
    };
  };
  const byAccount = {};
  for (const raw of Object.values(object(stats.byAccount))) {
    const item = object(raw);
    if (!validId(item.connectionId)) continue;
    const next = counters(item),
      previous = byAccount[item.connectionId];
    if (!previous) byAccount[item.connectionId] = next;
    else
      for (const key of Object.keys(next)) previous[key] = (previous[key] || 0) + (next[key] || 0);
  }
  return { totals: counters(stats, true), byAccount };
}

/** Explicit summaries only. Never return raw provider, usage or history payloads over IPC. */
export function createRouterOverviewService({ origin, headers = {}, fetchJson, autoSupported }) {
  const cache = new Map(),
    quotaCache = new Map(),
    modelCache = new Map();
  let pending = null;
  const get =
    fetchJson ||
    (async (route) => {
      const response = await globalThis.fetch(`${origin}${route}`, {
        headers: typeof headers === 'function' ? headers() : headers,
        signal: globalThis.AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    });
  const optional = async (route) => {
    try {
      return await get(route);
    } catch (error) {
      return error.status ? { error: 'local_query_failed', status: error.status } : null;
    }
  };
  const cachedGet = async (store, id, route, force) => {
    const old = store.get(id);
    const resetPassed =
      old &&
      normalizeRouterQuotas(old.value).some(
        (quota) => quota.resetAt > old.at && quota.resetAt <= Date.now(),
      );
    if (old && !force && !resetPassed && Date.now() - old.at < 60000) return old.value;
    const value = await optional(route);
    store.set(id, { at: Date.now(), value });
    return value;
  };
  return {
    async overview(period = 'today', force = false) {
      if (!ROUTER_PERIODS.includes(period)) period = 'today';
      if (pending) {
        await pending;
        return this.overview(period, false);
      }
      const cached = cache.get(period);
      if (cached && !force && Date.now() - cached.updatedAt < 15000) return cached;
      const run = (async () => {
        const [connectionsPayload, catalogPayload, statsPayload, capability] = await Promise.all([
          optional('/api/providers'),
          optional('/v1/models'),
          optional(`/api/usage/stats?period=${period}`),
          autoSupported === undefined
            ? optional('/api/mesp/capabilities')
            : { auto: autoSupported },
        ]);
        if (!Array.isArray(connectionsPayload?.connections))
          throw new Error('Não foi possível consultar as contas do 9Router.');
        const rawAccounts = connectionsPayload.connections.filter(
          (a) => validId(a?.id) && typeof a.provider === 'string',
        );
        const catalog = Array.isArray(catalogPayload?.data)
          ? catalogPayload.data.filter((m) => validModel(m?.id))
          : [];
        const stats = normalizeRouterStats(statsPayload);
        const accounts = [],
          models = new Map();
        // Four at a time bounds provider polling without blocking the renderer thread.
        for (let start = 0; start < rawAccounts.length; start += 4) {
          await Promise.all(
            rawAccounts.slice(start, start + 4).map(async (raw) => {
              const active =
                raw.isActive !== false &&
                !['error', 'failed', 'invalid', 'unauthorized', 'expired'].includes(raw.testStatus);
              const prefix = clean(
                raw.providerSpecificData?.prefix ||
                  PROVIDER_CATALOG[raw.provider]?.alias ||
                  raw.provider,
              );
              const [usage, live] = active
                ? await Promise.all([
                    cachedGet(
                      quotaCache,
                      raw.id,
                      `/api/usage/${encodeURIComponent(raw.id)}`,
                      force,
                    ),
                    cachedGet(
                      modelCache,
                      raw.id,
                      `/api/providers/${encodeURIComponent(raw.id)}/models`,
                      force,
                    ),
                  ])
                : [null, null];
              const quotas = normalizeRouterQuotas(usage);
              const locks = Object.entries(raw)
                .filter(([key]) => key.startsWith('modelLock_'))
                .flatMap(([key, value]) => {
                  const until = Date.parse(value);
                  return Number.isFinite(until) ? [{ model: key.slice(10), until }] : [];
                });
              const account = {
                id: raw.id,
                label: clean(raw.displayName || raw.name, `Conta ${rawAccounts.indexOf(raw) + 1}`),
                provider: clean(raw.provider),
                providerName: providerName(raw.provider),
                prefix,
                active,
                health: !active
                  ? raw.isActive === false
                    ? 'disabled'
                    : 'error'
                  : usage?.status === 401 ||
                      live?.status === 401 ||
                      /unauthori[sz]ed|authentication|401|expired|re-authorize|no valid token/i.test(
                        `${usage?.error || ''} ${usage?.message || ''} ${live?.warning || ''} ${live?.error || ''}`,
                      )
                    ? 'auth'
                    : quotas.length ||
                        raw.testStatus === 'success' ||
                        (live?.models?.length && !live.warning)
                      ? 'active'
                      : 'unknown',
                quotaState: quotas.length
                  ? 'available'
                  : usage?.error || !usage
                    ? 'error'
                    : 'unsupported',
                plan: clean(usage?.plan),
                limitReached: usage?.limitReached === true,
                quotas,
                locks,
                lastFailure:
                  Number(raw.errorCode || raw.lastError?.match(/^\[(\d{3})\]/)?.[1]) === 403
                    ? 'permission'
                    : null,
                consumption:
                  stats?.byAccount[raw.id] ||
                  (stats
                    ? {
                        requests: 0,
                        inputTokens: 0,
                        outputTokens: 0,
                        tokens: 0,
                        cachedTokens: 0,
                        cost: 0,
                      }
                    : null),
              };
              if (account.health === 'auth') account.quotaState = 'error';
              accounts.push(account);
              if (!active || account.health === 'auth') return;
              const fallback = catalog.filter((m) => m.id.startsWith(`${prefix}/`));
              const liveModels =
                Array.isArray(live?.models) && live.models.length ? live.models : null;
              for (const entry of liveModels || fallback) {
                const rawId = entry.id || entry.slug || entry.model;
                if (!validModel(rawId)) continue;
                const id = rawId.startsWith(`${prefix}/`)
                  ? rawId
                  : `${prefix}/${rawId.replace(/^models\//, '')}`;
                if (
                  !validModel(id) ||
                  (entry.type && !['llm', 'chat', 'text'].includes(entry.type))
                )
                  continue;
                const key = `9router/${id}`,
                  old = models.get(key);
                if (old) old.accountIds.push(raw.id);
                else
                  models.set(key, {
                    id: key,
                    name: clean(
                      entry.display_name || entry.displayName || entry.name,
                      id.split('/').slice(1).join('/'),
                    ),
                    provider: account.provider,
                    providerName: account.providerName,
                    accountIds: [raw.id],
                    source: liveModels && !live.warning ? 'live' : 'catalog',
                  });
              }
            }),
          );
        }
        accounts.sort(
          (a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label),
        );
        const choices = Array.from(models.values()).sort(
          (a, b) => a.providerName.localeCompare(b.providerName) || a.name.localeCompare(b.name),
        );
        const candidates = autoRouterCandidates(accounts, choices);
        const result = {
          updatedAt: Date.now(),
          period,
          accounts,
          models: choices,
          totals: stats?.totals || null,
          modelsAvailable: Array.isArray(catalogPayload?.data) || choices.length > 0,
          accountSource:
            capability?.source === '9router'
              ? '9router'
              : capability?.source === 'mesp'
                ? 'mesp'
                : 'external',
          usageAvailable: stats !== null,
          auto: {
            available: capability?.auto === true && candidates.length > 0,
            supported: capability?.auto === true,
            next: candidates[0] || null,
          },
        };
        cache.set(period, result);
        return result;
      })();
      pending = run;
      try {
        return await run;
      } finally {
        pending = null;
      }
    },
  };
}

/** Match the fixed installed auth implementation, injecting context in memory only. */
export function patchRouterAccountSelection(source) {
  const pattern = /([A-Za-z_$][\w$]*)\?\.preferredConnectionId\|\|null/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('9Router incompatível com a seleção de conta do MESP.');
  let patched = source.replace(
    pattern,
    '$1?.preferredConnectionId||globalThis.__mespRouterContext?.getStore()?.chooseAccount?.(arguments[0],arguments[1],arguments[2])||null',
  );
  if (source.includes('exports.id=4664')) {
    const available = 'let k=j.filter(a=>!(m.has(a.id)||(0,f.Bl)(a,c)));';
    if (!source.includes(available))
      throw new Error('9Router incompatível com a ordem de reset do MESP.');
    patched = patched.replace(
      available,
      `${available}k=globalThis.__mespRouterContext?.getStore()?.filterAvailable?.(k)||k;`,
    );
  }
  return patched;
}

export const ROUTER_PAGES = Object.freeze({
  dashboard: '/dashboard',
  providers: '/dashboard/providers',
  codex: '/dashboard/providers/codex',
  claude: '/dashboard/providers/claude',
  'gemini-cli': '/dashboard/providers/gemini-cli',
  'cli-tools': '/dashboard/cli-tools',
});
export function routerPage(page) {
  return typeof page === 'string' && Object.hasOwn(ROUTER_PAGES, page)
    ? ROUTER_PAGES[page]
    : ROUTER_PAGES.dashboard;
}
/** Only account counts reach the renderer, never credentials or provider-specific data. */
export function routerConnectionSummary(payload) {
  if (!payload || !Array.isArray(payload.connections)) return null;
  const providers = new Map();
  for (const connection of payload.connections) {
    if (
      !connection ||
      typeof connection.provider !== 'string' ||
      !/^[a-z0-9-]{1,80}$/i.test(connection.provider)
    )
      continue;
    const current = providers.get(connection.provider) || {
      provider: connection.provider,
      accounts: 0,
      active: 0,
    };
    current.accounts++;
    if (
      connection.isActive !== false &&
      !['error', 'failed', 'invalid', 'unauthorized', 'expired'].includes(connection.testStatus)
    )
      current.active++;
    providers.set(connection.provider, current);
  }
  return [...providers.values()];
}
