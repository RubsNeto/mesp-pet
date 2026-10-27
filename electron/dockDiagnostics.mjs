const SECRET_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [oculto]'],
  [/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}/g, '[chave oculta]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[token oculto]'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '[chave oculta]'],
  [/\bya29\.[0-9A-Za-z_-]{20,}/g, '[token oculto]'],
  [
    /("(?:access_?token|refresh_?token|id_?token|api_?key|token|password|secret|authorization|cookie)"\s*:\s*)"[^"]*"/gi,
    '$1"[oculto]"',
  ],
  [/([?&](?:key|token|access_token|api_key|code)=)[^&\s"']+/gi, '$1[oculto]'],
];

/** Removes credentials and the user's home folder from text that may leave the machine. */
export function redactLogText(text, { home } = {}) {
  let output = String(text ?? '');
  for (const [pattern, replacement] of SECRET_PATTERNS)
    output = output.replace(pattern, replacement);
  if (home && home.length > 3) {
    const variants = new Set([home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')]);
    for (const variant of variants) output = output.split(variant).join('~');
  }
  return output;
}

/** One log line: ISO time, level and a single-line message. */
export function formatLogLine(level, message, date = new Date()) {
  const text = String(message ?? '')
    .replace(/\r?\n/g, ' ⏎ ')
    .slice(0, 4000);
  return `${date.toISOString()} ${String(level).toUpperCase().padEnd(5)} ${text}\n`;
}

/** Plain-text report a person can paste into an issue. */
export function diagnosticsReport(info, logTail, options) {
  const lines = [
    `MESP ${info.version} (${info.channel})`,
    `Sistema: ${info.os} · ${info.arch}`,
    `Electron ${info.electron} · Chrome ${info.chrome} · Node ${info.node}`,
    `Idioma: ${info.locale}`,
    `Runtimes: Node ${info.runtimes.node} · OpenCode ${info.runtimes.opencode} · 9Router ${info.runtimes.router}`,
    `Contas conectadas: ${info.accounts}`,
    '',
    'Últimas linhas do log:',
    ...logTail,
  ];
  return redactLogText(lines.join('\n'), options);
}
