// Pure helpers: also loaded by the renderer through dockRouter.mjs, so no Node APIs here.
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_PROVIDERS = 24;

/** Ordered, de-duplicated provider ids; anything malformed is dropped. */
export function normalizeProviderPriority(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string' || !PROVIDER_ID.test(entry) || seen.has(entry)) continue;
    seen.add(entry);
    if (seen.size >= MAX_PROVIDERS) break;
  }
  return [...seen];
}

/** Listed providers come first in their order; unlisted ones keep the default order after them. */
export function providerRank(priority, provider) {
  const index = Array.isArray(priority) ? priority.indexOf(provider) : -1;
  return index === -1 ? (Array.isArray(priority) ? priority.length : 0) : index;
}
