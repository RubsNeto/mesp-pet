export const DOCK_AGENTS = Object.freeze([
  'codex',
  'claude',
  'mesp-code',
  'gemini',
  'aider',
  'kiro',
  'gh-copilot',
  'cursor',
]);
export const MAX_DOCK_PROJECTS = 10;
const HISTORY_MESSAGES = 100;
const HISTORY_MESSAGE_TEXT = 24000;
const HISTORY_PROJECT_TEXT = 120000;
const legacyChatErrors = new Set([
  'O modelo não retornou uma resposta válida. Tente novamente.',
  'O modelo não conseguiu responder. Confira a conta e a disponibilidade nas Configurações.',
  'Não foi possível conversar com o agente. Confira a conexão nas Configurações.',
  'Não foi possível conversar com o agente. Confira a conexão nas Configurações e tente novamente.',
  'A conta recusou a autenticação. Confira o login nas Configurações.',
]);
/** Retain the initial objective and recent turns across providers, within a bounded context. */
export function dockModelHistory(messages = []) {
  const usable = messages
    .filter(
      (message) =>
        message &&
        ['user', 'assistant'].includes(message.role) &&
        !['error', 'cancelled'].includes(message.status) &&
        !(message.role === 'assistant' && legacyChatErrors.has(message.content ?? message.text)) &&
        typeof (message.content ?? message.text) === 'string' &&
        (message.content ?? message.text).trim(),
    )
    .map((message) => ({
      role: message.role,
      content: (message.content ?? message.text).trim().slice(0, 6000),
    }));
  const indices = new Set();
  let size = 0;
  const add = (index) => {
    if (indices.has(index) || size + usable[index].content.length > 48000) return;
    indices.add(index);
    size += usable[index].content.length;
  };
  for (let index = 0; index < Math.min(4, usable.length); index++) add(index);
  for (let index = usable.length - 1; index >= 0 && indices.size < 40; index--) add(index);
  return [...indices].sort((a, b) => a - b).map((index) => usable[index]);
}
/** Bound recent chat text so streaming transcripts cannot fill the local profile. */
function recentConversation(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  let size = 0;
  for (let index = value.length - 1; index >= 0; index--) {
    const message = value[index];
    if (
      !message ||
      typeof message.id !== 'string' ||
      !message.id ||
      message.id.length > 120 ||
      seen.has(message.id) ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      !message.content.trim()
    )
      continue;
    const content = message.content.slice(-HISTORY_MESSAGE_TEXT);
    if (result.length >= HISTORY_MESSAGES || size + content.length > HISTORY_PROJECT_TEXT) break;
    seen.add(message.id);
    size += content.length;
    result.push({
      id: message.id,
      role: message.role,
      content,
      ...(['done', 'error', 'cancelled'].includes(message.status)
        ? { status: message.status }
        : {}),
      ...(message.role === 'assistant' &&
      typeof message.modelUsed === 'string' &&
      /^[A-Za-z0-9._/+:-]{1,240}$/.test(message.modelUsed)
        ? { modelUsed: message.modelUsed }
        : {}),
    });
  }
  return result.reverse();
}
export function readDockConversations(raw, projectIds) {
  try {
    const value = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      projectIds
        .map((id) => [id, recentConversation(value[id])])
        .filter(([, messages]) => messages.length),
    );
  } catch {
    return {};
  }
}
export function serializeDockConversations(conversations, projectIds) {
  return JSON.stringify(
    Object.fromEntries(
      projectIds
        .map((id) => [id, recentConversation(conversations[id])])
        .filter(([, messages]) => messages.length),
    ),
  );
}
/** Only restore drafts belonging to existing projects, preserving the user's text. */
export function readDockDrafts(raw, projectIds) {
  try {
    const entries = JSON.parse(raw || '[]');
    if (!Array.isArray(entries)) return new Map();
    const allowed = new Set(projectIds);
    return new Map(
      entries.filter(
        (entry) =>
          Array.isArray(entry) &&
          allowed.has(entry[0]) &&
          typeof entry[1] === 'string' &&
          entry[1].length,
      ),
    );
  } catch {
    return new Map();
  }
}
export function serializeDockDrafts(drafts, projectIds) {
  const allowed = new Set(projectIds);
  return JSON.stringify(
    Array.from(drafts).filter(
      ([id, text]) => allowed.has(id) && typeof text === 'string' && text.length,
    ),
  );
}
export function normalizeDockProjects(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value
    .filter((p) => {
      if (
        !p ||
        typeof p !== 'object' ||
        typeof p.id !== 'string' ||
        !/^mesp-[a-z0-9-]+$/i.test(p.id) ||
        ids.has(p.id)
      )
        return false;
      if (p.workDir !== null && (typeof p.workDir !== 'string' || !p.workDir.trim())) return false;
      ids.add(p.id);
      return true;
    })
    .slice(0, MAX_DOCK_PROJECTS)
    .map((p) => ({
      id: p.id,
      name:
        typeof p.name === 'string' && p.name.trim()
          ? p.name.trim().slice(0, 80)
          : projectName(p.workDir),
      workDir: p.workDir,
      agent: DOCK_AGENTS.includes(p.agent) ? p.agent : 'codex',
      ...(typeof p.routerModel === 'string' && /^9router\/[^\s]{1,200}$/.test(p.routerModel)
        ? { routerModel: p.routerModel }
        : {}),
      ...(typeof p.taskTitle === 'string' && p.taskTitle.trim()
        ? { taskTitle: taskTitle(p.taskTitle), titlePinned: p.titlePinned === true }
        : {}),
      ...restoreDockTask(p),
    }));
}
export function projectName(path) {
  return typeof path === 'string'
    ? path
        .replace(/[\\/]+$/, '')
        .split(/[\\/]/)
        .pop() || path
    : 'Meu primeiro projeto';
}
export function agentCanChange(state) {
  return !['thinking', 'working', 'waiting'].includes(state);
}
/** Human task names stay short without splitting emoji or losing accents. */
export function taskTitle(prompt) {
  const clean = String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(clean);
  return chars.length > 86 ? `${chars.slice(0, 85).join('').trimEnd()}…` : clean;
}
/** Keep a useful objective when the next turn only confirms or resumes it. */
export function nextDockTaskTitle(prompt, previous) {
  const normalized = String(prompt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.!?,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return previous &&
    /^(?:sim|ok|okay|certo|beleza|pode (?:fazer|seguir|continuar|executar)|(?:continue|continuar|prossiga|execute|refaca)(?: por favor)?|faca isso|tente novamente)(?: obrigado| obrigada)?$/.test(
      normalized,
    )
    ? taskTitle(previous)
    : taskTitle(prompt);
}
/** Only conversation text enters the isolated naming query, never files or credentials. */
export function dockTitleContext(project, prompt, previousPrompts = []) {
  return JSON.stringify({
    projeto: String(project.projectName || '').slice(0, 80),
    tarefaAtual: String(project.taskTitle || '').slice(0, 86),
    pedidosAnteriores: previousPrompts
      .filter((text) => typeof text === 'string' && text !== prompt)
      .slice(-3)
      .map((text) => text.slice(0, 900)),
    pedidoAtual: String(prompt).slice(0, 2400),
  });
}
export function unreadDockResult(project) {
  return Boolean(project.completedAt && (project.resultSeenAt || 0) < project.completedAt);
}
export function dockProjectStatus(project) {
  if (project.state === 'waiting') return { group: 'attention', label: 'Precisa de você' };
  if (project.hasActiveTask || ['thinking', 'working'].includes(project.state))
    return { group: 'active', label: 'Em andamento' };
  if (project.state === 'error' || project.taskError)
    return { group: 'attention', label: 'Erro na tarefa' };
  if (project.taskInterrupted) return { group: 'attention', label: 'Sessão interrompida' };
  if (project.completedAt || project.state === 'success')
    return { group: 'completed', label: 'Concluído' };
  return { group: 'ready', label: 'Pronto' };
}
export function dockProjectIndicatorState(project) {
  const { group } = dockProjectStatus(project);
  if (group === 'completed') return 'success';
  if (group === 'active') return project.state === 'thinking' ? 'thinking' : 'working';
  if (group === 'attention') {
    if (project.state === 'waiting') return 'waiting';
    return project.state === 'error' || project.taskError ? 'error' : 'waiting';
  }
  return project.state || 'idle';
}
/** A saved busy flag describes an interrupted session, never a live agent after restart. */
export function restoreDockTask(saved) {
  if (!saved || typeof saved !== 'object') return {};
  const result = {};
  if (Number.isSafeInteger(saved.completedAt) && saved.completedAt > 0) {
    result.completedAt = saved.completedAt;
    if (Number.isSafeInteger(saved.resultSeenAt) && saved.resultSeenAt > 0)
      result.resultSeenAt = Math.min(saved.resultSeenAt, saved.completedAt);
  }
  if (saved.hasActiveTask === true || saved.taskInterrupted === true) result.taskInterrupted = true;
  if (saved.taskError === true) result.taskError = true;
  return result;
}
/** A tool finishing is not a task finishing; only promote submitted turns. */
export function shouldPromoteProject(project, next) {
  return Boolean(project?.hasActiveTask && project.state !== 'success' && next === 'success');
}
export function isTaskCompletion(line) {
  return /^(?:(?:[✓✔]\s*)?(?:task|session|tarefa)\s+(?:complete(?:d)?|finished|conclu[ií]da|finalizada)(?:[.!]|\s*$)|(?:done|completed|finished|conclu[ií]d[oa]|finalizad[oa])[.!]?\s*$)/i.test(
    line.trim(),
  );
}
/** Use rendered terminal text (not raw ANSI) so TUI redraws don't duplicate replies. */
export function terminalReply(before, after, prompt) {
  const previous = String(before || '').split('\n');
  const current = String(after || '').split('\n');
  let common = 0;
  while (common < previous.length && previous[common] === current[common]) common++;
  const candidate = current.slice(common).join('\n').trim();
  const cleanPrompt = String(prompt || '').trim();
  const lines = candidate.split('\n');
  // CLI echo may include a prompt marker or Windows shell cwd.
  while (
    lines.length &&
    (lines[0].trim() === cleanPrompt ||
      lines[0].trim().endsWith(`>${cleanPrompt}`) ||
      lines[0].trim() === `› ${cleanPrompt}` ||
      lines[0].trim() === `❯ ${cleanPrompt}`)
  )
    lines.shift();
  return lines.join('\n').trim().slice(-24000);
}
export function aggregateDockState(states) {
  return (
    ['waiting', 'error', 'thinking', 'working', 'success', 'sleeping'].find((state) =>
      states.includes(state),
    ) || 'idle'
  );
}
export function visibleHitRegions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r) =>
        r &&
        ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(r[k])) &&
        r.width > 0 &&
        r.height > 0 &&
        r.width <= 20000 &&
        r.height <= 20000,
    )
    .slice(0, 32);
}
const plain = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
/** A greeting belongs to the MESP itself, before any agent login or project flow. */
export function dockGreetingReply(text) {
  if (typeof text !== 'string' || text.length > 100) return null;
  const greeting = plain(text)
    .replace(/[.,!?…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    !/^(?:(?:oi|ola|oie|hello|hi|bom dia|boa tarde|boa noite)(?: tudo bem| como vai)?|tudo bem|como vai)$/.test(
      greeting,
    )
  )
    return null;
  return 'Oi! Pode me perguntar ou pedir uma ação. Se precisar acessar os arquivos de um projeto, eu aviso antes.';
}
const AGENT_NAMES = {
  codex: 'codex',
  'codex cli': 'codex',
  claude: 'claude',
  'claude code': 'claude',
  gemini: 'gemini',
  'gemini cli': 'gemini',
  aider: 'aider',
  kiro: 'kiro',
  'kiro cli': 'kiro',
  'mesp code': 'mesp-code',
  cursor: 'cursor',
  'cursor agent': 'cursor',
};
export function parseDockRequest(text) {
  const raw = text.trim();
  const command = plain(raw).replace(/[.!?]+$/, '');
  const shortcuts = {
    '/accounts': { kind: 'settings', page: 'providers' },
    '/usage': { kind: 'settings', page: 'usage' },
    '/quota': { kind: 'settings', page: 'quota' },
    '/project': { kind: 'new-project' },
    '/new': { kind: 'new-mesp' },
    '/projects': { kind: 'projects' },
    '/appearance': { kind: 'customize' },
    '/help': { kind: 'help' },
    '/minimize': { kind: 'collapse' },
  };
  if (shortcuts[command]) return shortcuts[command];
  if (
    /^(?:ajuda|comandos|mostrar comandos|mostre os comandos|o que posso pedir|como usar(?: o mesp)?)$/.test(
      command,
    )
  )
    return { kind: 'help' };
  if (
    /^\/(?:models?|modelos?)$/.test(command) ||
    /^(?:(?:abrir|abra|ver|mostrar|mostre) )?(?:as )?(?:configuracoes|modelos)$/.test(command) ||
    /^(?:escolher|trocar|configurar)(?: o)? modelo$/.test(command)
  )
    return { kind: 'settings', page: 'overview' };
  if (/^(?:(?:ver|mostrar|mostre) )?(?:meu |o |historico de )?consumo$/.test(command))
    return { kind: 'settings', page: 'usage' };
  if (/^(?:(?:ver|mostrar|mostre) )?(?:as |minhas )?(?:cotas|resets|cotas e resets)$/.test(command))
    return { kind: 'settings', page: 'quota' };
  if (
    /^(?:(?:conectar|gerenciar|ver|mostrar|mostre) )?(?:minhas |as )?(?:contas|provedores)$/.test(
      command,
    ) ||
    /^conectar(?: uma)? conta$/.test(command)
  )
    return { kind: 'settings', page: 'providers' };
  if (/^(?:(?:abrir|abra|configurar|ver) )?(?:as )?ferramentas$/.test(command))
    return { kind: 'settings', page: 'cli-tools' };
  const connect = command.match(
    /^(?:conectar|gerenciar|login(?: no| do)?)(?: o)? (codex|claude(?: code)?|gemini(?: cli)?)$/,
  );
  if (connect)
    return {
      kind: 'settings',
      page: connect[1].startsWith('claude')
        ? 'claude'
        : connect[1].startsWith('gemini')
          ? 'gemini-cli'
          : 'codex',
    };
  const statusRequest = command.match(
    /^(?:(?:ver|mostrar|mostre|listar|liste) )?(?:os |as |meus |minhas )?(?:projetos|tarefas|mesps?) (concluidos|concluidas|finalizados|finalizadas|em andamento|ativos|ativas|com erro|pendentes)$/,
  );
  if (statusRequest)
    return {
      kind: 'projects',
      filter: /concluid|finalizad/.test(statusRequest[1])
        ? 'completed'
        : /andamento|ativ/.test(statusRequest[1])
          ? 'active'
          : 'attention',
    };
  if (
    /^(?:o que|qual projeto|quais projetos|quem) (?:ja )?(?:terminou|finalizou|concluiu)$/.test(
      command,
    )
  )
    return { kind: 'projects', filter: 'completed' };
  if (
    /^(?:quem|qual projeto|quais projetos) (?:esta|estao) (?:trabalhando|em andamento)$/.test(
      command,
    )
  )
    return { kind: 'projects', filter: 'active' };
  if (
    /^(?:(?:mostrar|mostre|listar|liste|ver|quais sao) )?(?:os )?(?:meus )?(?:projetos|mesps?)$/.test(
      command,
    )
  )
    return { kind: 'projects' };
  if (
    /^(?:novo mesp|mais um mesp|(?:criar|crie|adicionar|adicione)(?: um| outro)? mesp)$/.test(
      command,
    )
  )
    return { kind: 'new-mesp' };
  if (
    /^(?:novo projeto|criar um projeto|crie um projeto|abrir projeto|abra um projeto|abrir um projeto)$/.test(
      command,
    )
  )
    return { kind: 'new-project' };
  if (/^(?:personalizar|personalize)(?: o)? mesp$/.test(command)) return { kind: 'customize' };
  if (/^(?:recolher|minimizar|recolha|minimize)(?: o mesp| painel)?$/.test(command))
    return { kind: 'collapse' };
  const open = command.match(/^(?:abrir|abra|voltar para)(?: o)? (?:projeto|tarefa|mesp) (.+)$/);
  if (open) return { kind: 'select-project', name: open[1] };
  const agentOnly = command.match(/^(?:usar|use|chamar|chame|trocar para|abrir|abra)(?: o)? (.+)$/);
  if (agentOnly && AGENT_NAMES[agentOnly[1]])
    return { kind: 'agent', agent: AGENT_NAMES[agentOnly[1]] };
  const delegation =
    raw.match(
      /^(?:peça|peca|pedir|mande)(?: ao| para o)?\s+(codex(?: cli)?|claude(?: code)?|gemini(?: cli)?|aider|kiro(?: cli)?|mesp code|cursor(?: agent)?)\s+(?:para|que)\s+([\s\S]+)$/i,
    ) ||
    raw.match(
      /^(codex(?: cli)?|claude(?: code)?|gemini(?: cli)?|aider|kiro(?: cli)?|mesp code|cursor(?: agent)?):\s*([\s\S]+)$/i,
    );
  if (delegation)
    return {
      kind: 'delegate',
      agent: AGENT_NAMES[plain(delegation[1])],
      prompt: delegation[2].trim(),
    };
  return { kind: 'send', prompt: raw };
}
export function findDockProject(projects, name) {
  const needle = plain(name);
  const names = (project) =>
    [project.name, project.taskTitle]
      .filter((value) => typeof value === 'string' && value.trim())
      .map(plain);
  const exact = projects.filter((p) => names(p).includes(needle));
  if (exact.length === 1) return exact[0].id;
  const partial = projects.filter((p) => names(p).some((value) => value.includes(needle)));
  return partial.length === 1 ? partial[0].id : null;
}
