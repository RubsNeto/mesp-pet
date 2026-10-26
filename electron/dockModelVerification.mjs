// Which models actually answered on which account. Pure helpers, shared by the renderer
// bundle through dockRouter.mjs, so no Node APIs here.

/** A model that answered stays trusted for a week; a refusal is retried after three days. */
export const VERIFIED_OK_MS = 7 * 24 * 60 * 60 * 1000;
export const VERIFIED_FAIL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 4000;

export const verificationKey = (accountId, model) => `${accountId}|${model}`;

/** Models that are not chat models are never probed nor offered in the picker. */
export function isChatModel(id) {
  return !/(?:-review$|embed|image|tts|whisper|search|fetch|compaction|exec-agent|moderation)/i.test(
    String(id || ''),
  );
}

/** 'ok' | 'failed' | 'untested' for one account/model pair. */
export function verificationState(store, accountId, model, now = Date.now()) {
  const entry = store?.[verificationKey(accountId, model)];
  if (!entry || !Number.isFinite(entry.at)) return 'untested';
  if (entry.ok) return now - entry.at < VERIFIED_OK_MS ? 'ok' : 'untested';
  return now - entry.at < VERIFIED_FAIL_MS ? 'failed' : 'untested';
}

/** Keep only well-formed, recent entries. */
export function normalizeVerification(value, now = Date.now()) {
  const store = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return store;
  const entries = Object.entries(value)
    .filter(
      ([key, entry]) =>
        /^[A-Za-z0-9_-]{1,160}\|[A-Za-z0-9._/+:()-]{1,240}$/.test(key) &&
        entry &&
        typeof entry === 'object' &&
        typeof entry.ok === 'boolean' &&
        Number.isFinite(entry.at) &&
        entry.at <= now + 60000 &&
        now - entry.at < Math.max(VERIFIED_OK_MS, VERIFIED_FAIL_MS),
    )
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_ENTRIES);
  for (const [key, entry] of entries)
    store[key] = {
      ok: entry.ok,
      at: entry.at,
      ...(Number.isInteger(entry.status) ? { status: entry.status } : {}),
    };
  return store;
}

/** Statuses that prove the account cannot run the model (as opposed to a transient error). */
export function definitiveFailure(status, body = '') {
  if ([400, 401, 402, 403, 404, 406].includes(status)) return true;
  return /\[40[0-6]\]|NOT_FOUND|Requested entity was not found|model_not_(?:found|supported)|unsupported model/i.test(
    String(body),
  );
}
