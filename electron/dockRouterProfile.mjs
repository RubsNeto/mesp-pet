import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function hasAccounts(directory) {
  const file = join(directory, 'db', 'data.sqlite');
  if (!existsSync(file)) return false;
  let database;
  try {
    database = new DatabaseSync(file, { readOnly: true });
    return database.prepare('SELECT COUNT(*) AS count FROM providerConnections').get().count > 0;
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

/** Tests and populated MESP profiles stay independent. Existing 9Router logins
 * share their native store, avoiding duplicate rotating OAuth credentials. */
export function chooseRouterDataDirectory({ ownDirectory, appData, isolated = false }) {
  if (isolated || hasAccounts(ownDirectory)) return { directory: ownDirectory, source: 'mesp' };
  const existing = join(appData, '9router');
  return hasAccounts(existing)
    ? { directory: existing, source: '9router' }
    : { directory: ownDirectory, source: 'mesp' };
}
