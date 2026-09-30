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
  const open = command.match(/^(?:abrir|abra|voltar para)(?: o)? projeto (.+)$/);
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
  const exact = projects.filter((p) => plain(p.name) === needle);
  if (exact.length === 1) return exact[0].id;
  const partial = projects.filter((p) => plain(p.name).includes(needle));
  return partial.length === 1 ? partial[0].id : null;
}
