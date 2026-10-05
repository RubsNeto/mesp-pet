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
        : total > 0 && remaining !== null
          ? Math.max(0, Math.min(100, (1 - remaining / total) * 100))
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

function quotaApplies(key, model, multiplier) {
  const label = key.toLowerCase(),
    name = model.toLowerCase();
  if (label.includes('review')) return name.endsWith('-review');
  if (label.includes('premium') && multiplier === 0) return false;
  if (/^(?:gemini|gpt|claude)[-/]/.test(label)) {
    const exact = label.split(' ')[0];
    return name === exact || name.startsWith(`${exact}-`) || exact.startsWith(`${name}-`);
  }
  for (const family of ['sonnet', 'opus', 'haiku', 'flash', 'pro']) {
    if (new RegExp(`(?:^|[ _(/-])${family}(?:$|[ _)/-])`).test(label)) return name.includes(family);
  }
  return true;
}

const requestText = (content) =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter((part) => ['text', 'input_text'].includes(part?.type))
          .map((part) => part.text || '')
          .join('\n')
      : '';

/** Fast local classification; no extra model call, prompt storage or access to project files. */
export function classifyRouterRequest(body = {}, purpose = '') {
  const messages = Array.isArray(body.messages)
    ? body.messages
    : Array.isArray(body.input)
      ? body.input
      : [{ role: 'user', content: body.input }];
  const users = messages.filter((item) => item?.role === 'user');
  const latest = requestText(users.at(-1)?.content).trim();
  const followUp =
    /^(?:continue|continuar|prossiga|sim|ok|certo|pode|fa[çc]a|go on|yes|do it)[.!\s]*$/i.test(
      latest,
    );
  const text = (
    followUp
      ? users
          .slice(-4)
          .map((item) => requestText(item.content))
          .join('\n')
      : latest
  )
    .slice(-24000)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const tools = Array.isArray(body.tools) && body.tools.length > 0 && body.tool_choice !== 'none';
  const inputChars = messages.reduce((sum, item) => sum + requestText(item?.content).length, 0);
  if (purpose === 'title' || purpose === 'intent') return { complexity: 'light', level: 1, tools: false, inputChars };
  const advanced =
    /arquitetura|architecture|refator(?:acao|ar)|refactor|migr(?:acao|ar|ation)|seguranca|security|vulnerab|race condition|concorrencia|concurrency|distributed|distribuid|performance|desempenho|memory leak|vazamento|investig(?:ue|ar)|causa raiz|root cause|auditor|estrategia|strategy|raciocinio|prove\b|demonstr(?:e|acao)|matematic|otimiz(?:acao|ar|e)|optimiz/g;
  const advancedSignals = (text.match(advanced) || []).length;
  const coding =
    /\b(?:codigo|code|bug|debug|erro|error|teste|test|implement|program|api|sql|banco|database|typescript|javascript|python|react|repo|arquivo|file|funcao|function|class|deploy|sistema|system|app)\w*/.test(
      text,
    ) || /```/.test(text);
  const requirements = (text.match(/(?:^|\n)\s*(?:[-*]|\d+[.)])\s/g) || []).length;
  const extendedAnswer =
    /\b(?:detalhad\w*|aprofund\w*|profundidade|passo a passo|step by step|in depth|comprehensive|extens\w*)\b/.test(
      text,
    ) || /\b(?:[1-9]\d{3,}|[5-9]\d{2})\s*(?:palavras|words|linhas|lines)\b/.test(text);
  const quickQuestion =
    !followUp &&
    !extendedAnswer &&
    text.length <= 450 &&
    requirements < 2 &&
    advancedSignals < 2 &&
    /^(?:(?:oi|ola|bom dia|boa tarde|boa noite)[!, .]*$|o que (?:e|sao|significa)\b|qual (?:e|a|o|a diferenca|o significado)\b|quais (?:sao|as|os)\b|(?:me )?explique\b|defina\b|quanto (?:e|da)\b)/.test(
      text,
    ) &&
    !/\b(?:corrija|corrigir|conserte|resolva|implemente|implementar|crie|criar|altere|alterar|edite|editar|execute|executar|investigue|investigar|refatore|refatorar|migre|migrar|publique|publicar|instale|instalar|acesse|acessar|pesquise|pesquisar|analise|analisar|audite|auditar)\b/.test(
      text,
    ) &&
    !/```/.test(text) &&
    (!tools || body.tool_choice == null || body.tool_choice === 'auto') &&
    messages.at(-1)?.role !== 'tool';
  const level = quickQuestion
    ? 1
    : advancedSignals >= 2 ||
        text.length > 4000 ||
        requirements >= 6 ||
        (advancedSignals > 0 && (coding || text.length > 300)) ||
        (tools && inputChars > 24000)
      ? 3
      : coding || tools || extendedAnswer || text.length > 450 || advancedSignals > 0
        ? 2
        : 1;
  return { complexity: ['light', 'standard', 'advanced'][level - 1], level, tools, inputChars };
}

export function routerModelLevel(model) {
  const name = `${model.id} ${model.name || ''}`.toLowerCase();
  if (/mini|nano|haiku|flash|instant|lite|luna|small|fast/.test(name)) return 1;
  if (
    /opus|(?:^|[/ -])o[1-9](?:$|[.-])|reasoner|deepseek.*r1|gemini.*pro|gpt-[5-9]|codex.*max/.test(
      name,
    )
  )
    return 3;
  return 2;
}

export function autoRouterCandidates(accounts, models, now = Date.now(), request = null) {
  const choices = [];
  for (const account of accounts) {
    if (!account.active || account.health === 'auth' || account.health === 'error') continue;
    for (const model of models) {
      if (
        !model.accountIds.includes(account.id) ||
        /(?:-review$|embed|image|tts|whisper|search|fetch|compaction|exec-agent)/i.test(model.id)
      )
        continue;
      const name = model.id.replace(/^9router\/[^/]+\//, '');
      if (request?.tools && model.supportsTools === false) continue;
      // Leave space for output when a provider publishes its context limit.
      if (model.contextLength && request?.inputChars > model.contextLength * 2) continue;
      if (
        account.locks.some(
          (lock) => lock.until > now && (lock.model === 'all' || lock.model === name),
        )
      )
        continue;
      const quotas = account.quotas.filter((q) => quotaApplies(q.key, name, model.rateMultiplier));
      if (
        account.limitReached ||
        quotas.some((q) => !q.unlimited && (q.remaining === 0 || q.usedPercent >= 100))
      )
        continue;
      const resets = quotas.filter((q) => !q.unlimited && q.resetAt > now).map((q) => q.resetAt);
      const resetAt = resets.length ? Math.min(...resets) : null;
      const remaining = quotas
        .filter((q) => !q.unlimited && q.usedPercent !== null)
        .map((q) => 100 - q.usedPercent);
      const capacity = remaining.length ? Math.min(...remaining) : null;
      const level = routerModelLevel(model);
      const fit = !request
        ? 0
        : level >= request.level
          ? level - request.level
          : (request.level - level) * 4;
      const reserve = request?.level === 3 ? 10 : request?.level === 2 ? 5 : 1;
      const funding =
        quotas.length > 0 && quotas.every((q) => q.unlimited)
          ? 0
          : capacity === null
            ? 1
            : capacity >= reserve
              ? 0
              : 2;
      // The legacy preview has no request yet. Actual routing ranks task suitability first.
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
        speed: /nano|flash[- ]?lite/.test(name)
          ? 0
          : /flash|instant|gpt-4o-mini/.test(name)
            ? 1
            : /haiku|mini|lite|small|fast|luna/.test(name)
              ? /gpt-[5-9]|reason/.test(name)
                ? 3
                : 2
              : 4,
        level,
        fit,
        funding,
        rateMultiplier: number(model.rateMultiplier),
      });
    }
  }
  return choices.sort(
    (a, b) =>
      a.fit - b.fit ||
      (request ? a.funding - b.funding : 0) ||
      (a.resetAt ?? Infinity) - (b.resetAt ?? Infinity) ||
      Number(b.live) - Number(a.live) ||
      (b.capacity ?? -1) - (a.capacity ?? -1) ||
      (request?.level === 1 ? a.speed - b.speed : 0) ||
      (request ? (a.rateMultiplier ?? 1) - (b.rateMultiplier ?? 1) : 0) ||
      b.quality - a.quality ||
      a.accountId.localeCompare(b.accountId) ||
      b.model.localeCompare(a.model),
  );
}

/** Short local cooldowns prevent repeatedly selecting a recently rejected account/model. */
export function createRouterHealth(saved = []) {
  const now = Date.now();
  const failures = new Map(
    (Array.isArray(saved) ? saved : [])
      .slice(-512)
      .filter(
        (entry) =>
          Array.isArray(entry) &&
          typeof entry[0] === 'string' &&
          /^[A-Za-z0-9_-]{1,160}:[A-Za-z0-9._/+*:-]{1,240}$/.test(entry[0]) &&
          Number.isFinite(entry[1]) &&
          entry[1] > now &&
          entry[1] <= now + 1800000,
      )
      .map(([id, until]) => [id, { until }]),
  );
  const key = (choice, modelOnly) => `${choice.accountId}:${modelOnly ? choice.model : '*'}`;
  return {
    snapshot(now = Date.now()) {
      return [...failures]
        .filter(([, failure]) => failure.until > now)
        .slice(-512)
        .map(([id, failure]) => [id, failure.until]);
    },
    available(choice, now = Date.now()) {
      for (const id of [key(choice, false), key(choice, true)]) {
        const failure = failures.get(id);
        if (failure && failure.until > now) return false;
        if (failure) failures.delete(id);
      }
      return true;
    },
    failed(choice, status, retryAfter = null, now = Date.now()) {
      const modelOnly = ['model', 'empty'].includes(status);
      let duration =
        status === 'model'
          ? 600000
          : status === 'empty'
            ? 120000
            : status === 401
              ? 300000
              : status === 403
                ? 120000
                : status === 429 || status === 402
                  ? 60000
                  : 15000;
      if (status === 429 || status === 402) {
        const retry =
          typeof retryAfter === 'string' && /^\d+(?:\.\d+)?$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Date.parse(retryAfter || '') - now;
        if (retry > 0) duration = Math.min(1800000, retry);
        else if (choice.resetAt > now) duration = Math.min(duration, choice.resetAt - now);
      }
      failures.set(key(choice, modelOnly), { until: now + Math.max(1000, duration) });
    },
  };
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
export function createRouterOverviewService({
  origin,
  headers = {},
  fetchJson,
  autoSupported,
  now = Date.now,
}) {
  const cache = new Map(),
    quotaCache = new Map(),
    modelCache = new Map();
  const pending = new Map(),
    modelRequests = new Map(),
    quotaRequests = new Map();
  const get =
    fetchJson ||
    (async (route) => {
      const response = await globalThis.fetch(`${origin}${route}`, {
        headers: typeof headers === 'function' ? headers() : headers,
        signal: globalThis.AbortSignal.timeout(
          /\/providers\/[^/]+\/models$/.test(route)
            ? 3000
            : /\/usage\/[^/?]+$/.test(route)
              ? 3000
              : 8000,
        ),
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
  const cachedGet = async (store, id, route, force, background = false) => {
    const old = store.get(id);
    const resetPassed =
      old &&
      normalizeRouterQuotas(old.value).some(
        (quota) => quota.resetAt > old.at && quota.resetAt <= now(),
      );
    if (old && !force && !resetPassed && now() - old.at < 60000) return old.value;
    const canReuse = old && background && !force && !resetPassed && now() - old.at < 300000;
    const requests = store === modelCache ? modelRequests : quotaRequests;
    if (requests.has(id)) return canReuse ? old.value : requests.get(id);
    const request = optional(route).then((value) => {
      // Transient refresh errors do not erase a recently confirmed catalogue/quota.
      // Authentication failures do invalidate it. Reuse never extends its age.
      if (value != null && (!value.error || [401, 403].includes(value.status)))
        store.set(id, { at: now(), value });
      else if (!old) store.set(id, { at: now(), value });
      requests.delete(id);
      cache.delete('routing');
      return value;
    });
    requests.set(id, request);
    return canReuse ? old.value : request;
  };
  return {
    async models(force = false) {
      return this.overview('today', force, true);
    },
    async routing(force = false) {
      return this.overview('today', force, false, true);
    },
    async overview(period = 'today', force = false, modelsOnly = false, routingOnly = false) {
      if (!ROUTER_PERIODS.includes(period)) period = 'today';
      const cacheKey = modelsOnly ? 'models' : routingOnly ? 'routing' : period;
      if (pending.has(cacheKey)) {
        return pending.get(cacheKey);
      }
      const cached = cache.get(cacheKey);
      const resetPassed = cached?.accounts.some((account) =>
        account.quotas.some((quota) => quota.resetAt > cached.updatedAt && quota.resetAt <= now()),
      );
      if (cached && !force && !resetPassed && now() - cached.updatedAt < 15000) return cached;
      const run = (async () => {
        const [connectionsPayload, statsPayload, capability] = await Promise.all([
          optional('/api/providers'),
          modelsOnly || routingOnly ? null : optional(`/api/usage/stats?period=${period}`),
          autoSupported === undefined
            ? optional('/api/mesp/capabilities')
            : { auto: autoSupported },
        ]);
        if (!Array.isArray(connectionsPayload?.connections))
          throw new Error('Não foi possível consultar as contas do 9Router.');
        const rawAccounts = connectionsPayload.connections.filter(
          (a) => validId(a?.id) && typeof a.provider === 'string',
        );
        const stats = normalizeRouterStats(statsPayload);
        const accounts = [],
          models = new Map();
        // Model selection does not wait for quota/history requests. Bound live discovery to eight accounts.
        for (let start = 0; start < rawAccounts.length; start += 8) {
          await Promise.all(
            rawAccounts.slice(start, start + 8).map(async (raw) => {
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
                    modelsOnly
                      ? quotaCache.get(raw.id)?.value || null
                      : cachedGet(
                          quotaCache,
                          raw.id,
                          `/api/usage/${encodeURIComponent(raw.id)}`,
                          force,
                          routingOnly,
                        ),
                    cachedGet(
                      modelCache,
                      raw.id,
                      `/api/providers/${encodeURIComponent(raw.id)}/models`,
                      force,
                      routingOnly,
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
                  Number(raw.errorCode || raw.lastError?.match(/^\[(\d{3})\]/)?.[1]) === 403 ||
                  live?.status === 403
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
              if (!active || account.health === 'auth' || account.lastFailure === 'permission')
                return;
              const liveModels =
                Array.isArray(live?.models) && !live.warning && !live.error ? live.models : [];
              for (const entry of liveModels) {
                const rawId = entry.id || entry.slug || entry.model;
                if (!validModel(rawId)) continue;
                const id = rawId.startsWith(`${prefix}/`)
                  ? rawId
                  : `${prefix}/${rawId.replace(/^models\//, '')}`;
                if (
                  !validModel(id) ||
                  (entry.type && !['llm', 'chat', 'text'].includes(entry.type)) ||
                  entry.model_picker_enabled === false ||
                  /(?:^|[-_ ])(?:exec[-_ ]agent|trajectory[-_ ]compaction|copilot[-_ ]search)/i.test(
                    rawId,
                  )
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
                    source: 'live',
                    ...(typeof entry.capabilities?.supports?.tool_calls === 'boolean'
                      ? { supportsTools: entry.capabilities.supports.tool_calls }
                      : {}),
                    ...(number(
                      entry.contextLength ?? entry.capabilities?.limits?.max_context_window_tokens,
                    )
                      ? {
                          contextLength: number(
                            entry.contextLength ??
                              entry.capabilities?.limits?.max_context_window_tokens,
                          ),
                        }
                      : {}),
                    ...(number(entry.rateMultiplier ?? entry.billing?.multiplier) !== null
                      ? {
                          rateMultiplier: number(entry.rateMultiplier ?? entry.billing?.multiplier),
                        }
                      : {}),
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
        const candidates = autoRouterCandidates(accounts, choices, now());
        const available = new Map();
        for (const candidate of candidates) {
          const ids = available.get(candidate.model) || [];
          ids.push(candidate.accountId);
          available.set(candidate.model, ids);
        }
        const validChoices = choices
          .filter((model) => available.has(model.id))
          .map((model) => ({ ...model, accountIds: available.get(model.id) }));
        const result = {
          updatedAt: now(),
          period,
          accounts,
          models: validChoices,
          totals: stats?.totals || null,
          modelsAvailable: validChoices.length > 0,
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
        cache.set(cacheKey, result);
        return result;
      })();
      pending.set(cacheKey, run);
      try {
        return await run;
      } finally {
        pending.delete(cacheKey);
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

/** 0.5.40 parses Copilot Responses as SSE even for a non-streaming caller.
 * Ask the upstream for SSE, so its native translator can produce the complete JSON reply.
 * Apply in memory only; the shared installed dependency remains untouched.
 */
export function patchRouterCopilotResponses(source) {
  const before = 'n=this.buildHeaders(d,c),p=(0,h.h)(a,b,c,d);';
  if (source.split(before).length !== 2)
    throw new Error('9Router incompatível com a tradução de respostas do Copilot.');
  return source.replace(before, 'n=this.buildHeaders(d,!0),p=(0,h.h)(a,b,!0,d);');
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
export function routerRunModel(route, run) {
  if (
    !route ||
    !run?.autoModel ||
    run.cancelled ||
    !run.sessionId ||
    route.session !== run.sessionId ||
    !Number.isFinite(route.startedAt) ||
    !Number.isFinite(run.startedAt) ||
    route.startedAt < run.startedAt ||
    typeof route.model !== 'string' ||
    !/^[A-Za-z0-9._/+:-]{1,240}$/.test(route.model) ||
    route.model === 'mesp-auto' ||
    route.model === AUTO_ROUTER_MODEL
  )
    return null;
  return route.model;
}

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
