import path from 'node:path';
import process from 'node:process';

const MAX_PROJECTS = 200;
const MAX_RULES = 50;
const MAX_PATTERNS = 20;

/** Stable key for a project folder: resolved, without trailing separators,
 * case-insensitive on Windows. */
export function projectKey(cwd, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  let resolved = pathApi.resolve(String(cwd));
  while (resolved.length > 1 && /[\\/]$/.test(resolved) && !/^[A-Za-z]:[\\/]$/.test(resolved))
    resolved = resolved.slice(0, -1);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** OpenCode-style wildcard: `*` matches any run of characters, `?` one character. */
export function wildcardMatch(pattern, value) {
  const source = String(pattern)
    .split('')
    .map((char) =>
      char === '*'
        ? '[\\s\\S]*'
        : char === '?'
          ? '[\\s\\S]'
          : char.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${source}$`).test(String(value));
}

function cleanPatterns(patterns) {
  return Array.isArray(patterns)
    ? [
        ...new Set(patterns.filter((item) => typeof item === 'string' && item.length <= 1000)),
      ].slice(0, MAX_PATTERNS)
    : [];
}

function cleanRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const permission = typeof rule.permission === 'string' ? rule.permission.slice(0, 100) : '';
  const patterns = cleanPatterns(rule.patterns);
  if (!permission || !patterns.length) return null;
  const createdAt = Number.isFinite(rule.createdAt) ? rule.createdAt : 0;
  return { permission, patterns, createdAt };
}

/** Validates a store read from disk; anything malformed is dropped. */
export function normalizeRuleStore(raw) {
  const projects = {};
  const source =
    raw && typeof raw === 'object' && raw.projects && typeof raw.projects === 'object'
      ? raw.projects
      : {};
  for (const [key, entry] of Object.entries(source).slice(0, MAX_PROJECTS)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.rules)) continue;
    const rules = entry.rules.map(cleanRule).filter(Boolean).slice(0, MAX_RULES);
    if (rules.length) projects[key] = { label: String(entry.label || key).slice(0, 4096), rules };
  }
  return { version: 1, projects };
}

/** True when a saved rule covers every pattern of this permission request. */
export function rulesAllow(rules, { permission, patterns }) {
  const requested = cleanPatterns(patterns);
  return (rules || []).some((rule) => {
    if (rule.permission !== permission) return false;
    if (!requested.length) return rule.patterns.includes('*');
    return requested.every((value) =>
      rule.patterns.some((pattern) => wildcardMatch(pattern, value)),
    );
  });
}

export function addRule(store, key, label, rule) {
  const clean = cleanRule({ ...rule, createdAt: rule.createdAt ?? Date.now() });
  if (!clean) return store;
  const current = store.projects[key]?.rules || [];
  const duplicate = current.some(
    (item) =>
      item.permission === clean.permission &&
      item.patterns.length === clean.patterns.length &&
      item.patterns.every((pattern) => clean.patterns.includes(pattern)),
  );
  const rules = duplicate ? current : [...current, clean].slice(-MAX_RULES);
  return { version: 1, projects: { ...store.projects, [key]: { label, rules } } };
}

export function removeRule(store, key, index) {
  const entry = store.projects[key];
  if (!entry) return store;
  const rules = entry.rules.filter((_, position) => position !== index);
  const projects = { ...store.projects };
  if (rules.length) projects[key] = { ...entry, rules };
  else delete projects[key];
  return { version: 1, projects };
}
