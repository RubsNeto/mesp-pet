import { URL } from 'node:url';

/** MCP servers MESP manages itself; the extensions screen never shows or edits them. */
export const RESERVED_MCP = new Set(['mesp_computer']);
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/;

/** Splits a command line into arguments, honouring single and double quotes. */
export function parseCommandLine(text) {
  const args = [];
  let current = '';
  let quote = '';
  let started = false;
  for (const char of String(text ?? '').trim()) {
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) args.push(current);
      current = '';
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (quote) return null;
  if (started) args.push(current);
  return args;
}

function validRemoteUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

/** Builds an OpenCode MCP entry from the form, or explains what is wrong. */
export function mcpEntryFromForm({ name, type, command, url }) {
  const cleanName = String(name ?? '').trim();
  if (!NAME.test(cleanName)) return { error: 'Use um nome com letras, números, - ou _.' };
  if (RESERVED_MCP.has(cleanName)) return { error: 'Este nome é reservado pelo MESP.' };
  if (type === 'remote') {
    const cleanUrl = String(url ?? '').trim();
    if (!validRemoteUrl(cleanUrl))
      return { error: 'Use um endereço https, ou http apenas para localhost.' };
    return { name: cleanName, entry: { type: 'remote', url: cleanUrl, enabled: true } };
  }
  const args = parseCommandLine(command);
  if (!args) return { error: 'Feche as aspas do comando.' };
  if (!args.length) return { error: 'Informe o comando que inicia o servidor.' };
  return { name: cleanName, entry: { type: 'local', command: args, enabled: true } };
}

/** The user's MCP servers from an OpenCode config, for display. */
export function listMcpServers(config) {
  const mcp = config && typeof config.mcp === 'object' && config.mcp ? config.mcp : {};
  return Object.entries(mcp)
    .filter(([name, entry]) => !RESERVED_MCP.has(name) && entry && typeof entry === 'object')
    .map(([name, entry]) => ({
      name,
      type: entry.type === 'remote' ? 'remote' : 'local',
      target:
        entry.type === 'remote'
          ? String(entry.url ?? '')
          : Array.isArray(entry.command)
            ? entry.command.join(' ')
            : '',
      enabled: entry.enabled !== false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function withMcpServer(config, name, entry) {
  return { ...config, mcp: { ...(config.mcp || {}), [name]: entry } };
}

export function withoutMcpServer(config, name) {
  if (RESERVED_MCP.has(name)) return config;
  const mcp = { ...(config.mcp || {}) };
  delete mcp[name];
  return { ...config, mcp };
}

export function withMcpEnabled(config, name, enabled) {
  const current = config.mcp?.[name];
  if (!current || RESERVED_MCP.has(name)) return config;
  return withMcpServer(config, name, { ...current, enabled: Boolean(enabled) });
}

/** Reads `name` and `description` from a SKILL.md front matter block. */
export function parseSkillFile(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ''));
  if (!match) return null;
  const field = (key) => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(match[1]);
    return line ? line[1].trim().replace(/^(['"])(.*)\1$/, '$2') : '';
  };
  const name = field('name');
  if (!name) return null;
  return { name: name.slice(0, 80), description: field('description').slice(0, 300) };
}
