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
