// src/services/stateDetect.mjs
//
// Motor PURO de detecção de estado a partir do output de uma CLI de IA.
// Escrito em JavaScript ESM de propósito: é a ÚNICA fonte de verdade da lógica
// mais frágil do MESP (as regexes), e é importado tanto pelo app (KiroChatPanel)
// quanto pelos testes node:test — sem espelhamento, sem divergência.
//
// Estados detectáveis (prioridade do maior para o menor):
//   error  > waiting > success > thinking > working
//
// "waiting" é o estado novo e mais valioso para devs: o agente pausou esperando
// uma confirmação/entrada do usuário (y/n, aprovação de tool, senha…).

/**
 * Remove sequências ANSI (cores, posicionamento de cursor) para deixar o texto
 * limpo para casar com regex. Cobre CSI (`\x1b[...m`), OSC e alguns escapes
 * simples comuns em TUIs.
 */
export function stripAnsi(input) {
  if (!input) return '';
  return (
    input
      // CSI: ESC [ ... letra
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      // OSC: ESC ] ... BEL ou ESC \
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // Escapes simples de 2 bytes restantes
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[@-Z\\-_]/g, '')
  );
}

/** Testa se algum dos padrões casa com o texto. */
export function matchesAny(text, patterns) {
  if (!patterns) return false;
  for (const re of patterns) {
    re.lastIndex = 0;
    if (re.test(text)) return true;
  }
  return false;
}

// Caracteres de spinner Braille usados por praticamente todas as TUIs de IA.
const SPINNER = '[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷⣦⣄⣠⣀]';

/**
 * Marcadores genéricos — funcionam de forma aproximada em qualquer CLI.
 * Cada preset pode estender/sobrescrever via PRESET_MARKERS.
 * @type {{thinking:RegExp[],working:RegExp[],waiting:RegExp[],success:RegExp[],error:RegExp[]}}
 */
export const GENERIC_MARKERS = {
  // Spinner + palavra de processamento, ou "…"/reticências de raciocínio.
  thinking: [
    new RegExp(
      `${SPINNER}\\s*(thinking|pensando|processing|processando|working|trabalhando|generating|gerando|analyzing|analisando|loading|carregando|reasoning|reflecting|computing|esc to interrupt)`,
      'i',
    ),
    /\b(thinking|reasoning|analyzing|pensando|processando|gerando)(…|\.{3})\s*$/i,
  ],
  // Linhas que indicam produção ativa de resultado (após o thinking).
  working: [
    new RegExp(`${SPINNER}\\s*\\S`),
    /\b(running|executando|writing|editing|applying|building|installing)\b/i,
  ],
  // O agente PAUSOU esperando o usuário. Anchored no fim da linha quando possível.
  waiting: [
    /\(\s*y(es)?\s*\/\s*n(o)?\s*\)\s*[:?]?\s*$/i,
    /\[\s*y\s*\/\s*n\s*\]\s*[:?]?\s*$/i,
    /\b(do you want to|would you like to|deseja|você quer|gostaria de)\b.*\??\s*$/i,
    /\b(proceed|continue|continuar|prosseguir|overwrite|sobrescrever|are you sure|tem certeza|confirm|confirmar)\??\s*$/i,
    /\bpress (enter|any key|return)\b/i,
    /\b(pressione|aperte) (enter|qualquer tecla)\b/i,
    /\b(allow|permitir|approve|aprovar|grant|conceder)\b.*\??\s*$/i,
    /(password|passphrase|senha)\s*:\s*$/i,
    /❯\s*\d+\.\s/, // cursor de seleção numerada (Claude Code / inquirer)
    /\?\s.*\(.*\)\s*$/, // estilo inquirer: "? Pergunta (Y/n)"
    /\[(y\/n|s\/n|yes\/no|sim\/não)\]/i,
  ],
  success: [
    /^[✓✔]/,
    /credits?:.*time:.*s/i, // formato Kiro CLI
    /\b(done|completed|finished|success(fully)?|conclu[ií]d[oa]|finalizad[oa]|prontinho|pronto)[.!]?\s*$/i,
    /✨\s*done/i,
  ],
  error: [
    /^[✗✘❌×]/,
    /^(error|erro|fatal|exception|panic)\b/i,
    /^traceback \(most recent call last\)/i,
    /\b(command not found|no such file or directory|comando não encontrado)\b/i,
    /\bnpm err!/i,
  ],
};

/**
 * Marcadores específicos por preset (estendem os genéricos). Mantidos aqui (e
 * não em aiPresets.ts) para que TODA a lógica de detecção fique nesta camada
 * pura e testável.
 * @type {Record<string, Partial<typeof GENERIC_MARKERS>>}
 */
export const PRESET_MARKERS = {
  opencode: {
    waiting: [
      /\b(allow once|allow always|reject)\b/i,
      /\b(permission required|requesting permission)\b/i,
      /\bselect (an option|a permission)\b/i,
    ],
    thinking: [
      /\b(thinking|reasoning|analyzing)\b.*\b(esc|interrupt)\b/i,
      /\bbuild\s*[Â·•]\s*\S+/i,
    ],
    working: [
      /^\s*(read|write|edit|bash|glob|grep|list|patch|task)\b/i,
      /\b(tool|command)\s+(call|running|executing)\b/i,
    ],
    success: [/\b(session|task) (complete|completed)\b/i],
    error: [/\b(opencode|9router)\s+(error|failed)\b/i],
  },
  claude: {
    waiting: [
      /\b(do you want to (make this edit|create|run|proceed))/i,
      /❯\s*\d+\.\s*(yes|no|sim|não)/i,
      /\b(allow this (action|command|tool))\b/i,
    ],
    thinking: [new RegExp(`${SPINNER}\\s*(\\w+ing)`, 'i'), /\(esc to interrupt\)/i],
  },
  kiro: {
    success: [/credits?:.*time:.*s/i],
  },
  aider: {
    waiting: [/\((y)es\/(n)o(\/all|\/don't ask)?\)\s*\[?.*\]?\s*$/i, /^>\s*$/],
  },
  gemini: {},
  codex: {},
  'gh-copilot': {
    waiting: [/\bselect an option\b/i, /❯\s/],
  },
  cursor: {},
};

const PRIORITY = ['error', 'waiting', 'success', 'thinking', 'working'];

/**
 * Funde marcadores genéricos com os do preset (preset primeiro em cada
 * categoria, mas a prioridade entre categorias é fixa).
 * @param {Partial<typeof GENERIC_MARKERS>} [presetMarkers]
 */
export function mergeMarkers(presetMarkers) {
  /** @type {typeof GENERIC_MARKERS} */
  const merged = { thinking: [], working: [], waiting: [], success: [], error: [] };
  for (const cat of PRIORITY) {
    const preset = presetMarkers && presetMarkers[cat] ? presetMarkers[cat] : [];
    merged[cat] = [...preset, ...(GENERIC_MARKERS[cat] || [])];
  }
  return merged;
}

/** Resolve o id de preset a partir do comando configurado. */
export function presetIdForCommand(command) {
  const cmd = String(command || '').toLowerCase();
  if (cmd.includes('9code') || cmd.includes('opencode')) return 'opencode';
  if (cmd.includes('claude')) return 'claude';
  if (cmd.includes('kiro')) return 'kiro';
  if (cmd.includes('aider')) return 'aider';
  if (cmd.includes('gemini')) return 'gemini';
  if (cmd.includes('codex')) return 'codex';
  if (cmd === 'gh' || cmd.includes('copilot')) return 'gh-copilot';
  if (cmd.includes('cursor')) return 'cursor';
  return null;
}

/** Retorna os marcadores fundidos para um comando de CLI. */
export function getMarkersForCommand(command) {
  const id = presetIdForCommand(command);
  return mergeMarkers(id ? PRESET_MARKERS[id] : undefined);
}

/**
 * Casa um trecho de texto (idealmente UMA linha já limpa de ANSI) contra os
 * marcadores e devolve o estado de maior prioridade, ou null se nada casar.
 * @param {string} text
 * @param {typeof GENERIC_MARKERS} markers
 * @returns {'thinking'|'working'|'waiting'|'success'|'error'|null}
 */
export function matchState(text, markers) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const cat of PRIORITY) {
    if (matchesAny(trimmed, markers[cat])) return cat;
  }
  return null;
}

/**
 * Detecção imediata (sem esperar fim de linha) usada para spinners de
 * "thinking", que chegam sem newline. Retorna 'thinking' ou null.
 * @param {string} cleaned texto JÁ sem ANSI
 * @param {typeof GENERIC_MARKERS} markers
 */
export function matchThinking(cleaned, markers) {
  return matchesAny(cleaned, markers.thinking) ? 'thinking' : null;
}
