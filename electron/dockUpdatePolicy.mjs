/** How this install receives updates. Windows (NSIS) and AppImage can replace
 * themselves; an unsigned macOS app cannot (Squirrel.Mac requires a signature),
 * and a .deb belongs to the system package manager, so both get a download link. */
export function updateMode({ packaged, platform, appImage }) {
  if (!packaged) return 'off';
  if (platform === 'win32') return 'auto';
  if (platform === 'linux' && appImage) return 'auto';
  return 'manual';
}

function parts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(version).trim());
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] || '' };
}

/** True when `candidate` is a strictly newer semantic version than `current`. */
export function isNewerVersion(current, candidate) {
  const a = parts(current);
  const b = parts(candidate);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (b.core[i] !== a.core[i]) return b.core[i] > a.core[i];
  }
  if (a.pre === b.pre) return false;
  if (!b.pre) return true;
  if (!a.pre) return false;
  return b.pre.localeCompare(a.pre, 'en', { numeric: true }) > 0;
}
