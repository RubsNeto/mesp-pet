const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseHunks(patch) {
  const hunks = [];
  let hunk = null;
  let lastSign = '';
  for (const line of String(patch).split('\n')) {
    const header = HUNK.exec(line);
    if (header) {
      hunk = {
        newStart: Number(header[3]),
        newCount: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
        oldNoEol: false,
        newNoEol: false,
      };
      hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith('\\')) {
      if (lastSign === '-') hunk.oldNoEol = true;
      else if (lastSign === '+') hunk.newNoEol = true;
      else {
        hunk.oldNoEol = true;
        hunk.newNoEol = true;
      }
      continue;
    }
    const sign = line[0];
    if (sign !== ' ' && sign !== '-' && sign !== '+') continue;
    hunk.lines.push({ sign, text: line.slice(1) });
    lastSign = sign;
  }
  return hunks;
}

const bare = (line) => (line.endsWith('\r') ? line.slice(0, -1) : line);

/** Undoes a unified patch on the file's current text. Returns null when the
 * current text no longer matches what the patch produced. */
export function reversePatch(current, patch) {
  const hunks = parseHunks(patch);
  if (!hunks.length) return null;
  const text = String(current ?? '');
  const endsWithNewline = text.endsWith('\n');
  const lines = text === '' ? [] : (endsWithNewline ? text.slice(0, -1) : text).split('\n');
  const crlf =
    lines.length > 0 && lines.filter((line) => line.endsWith('\r')).length > lines.length / 2;
  const output = [];
  let cursor = 0;
  let oldNoEol = false;
  let newNoEol = false;
  for (const hunk of hunks) {
    const start = hunk.newCount === 0 ? hunk.newStart : hunk.newStart - 1;
    if (start < cursor || start > lines.length) return null;
    output.push(...lines.slice(cursor, start));
    cursor = start;
    for (const { sign, text: content } of hunk.lines) {
      if (sign === '-') {
        output.push(crlf ? `${bare(content)}\r` : bare(content));
        continue;
      }
      if (cursor >= lines.length || bare(lines[cursor]) !== bare(content)) return null;
      if (sign === ' ') output.push(lines[cursor]);
      cursor += 1;
    }
    oldNoEol ||= hunk.oldNoEol;
    newNoEol ||= hunk.newNoEol;
  }
  output.push(...lines.slice(cursor));
  if (!output.length) return '';
  const trailing = oldNoEol ? false : newNoEol ? true : endsWithNewline || text === '';
  return output.join('\n') + (trailing ? '\n' : '');
}

/** Decides how to restore one file changed by an agent step. */
export function revertFilePlan({ status, patch, before, after, current, exists }) {
  if (typeof before === 'string' && typeof after === 'string') {
    if ((exists ? current : '') !== after) return { action: 'conflict' };
    if (status === 'added' || (before === '' && !exists)) return { action: 'delete' };
    return { action: 'write', content: before };
  }
  if (status === 'added' && !exists) return { action: 'unchanged' };
  if (status === 'deleted' && exists) return { action: 'conflict' };
  const restored = reversePatch(exists ? current : '', patch);
  if (restored === null) return { action: 'conflict' };
  if (status === 'added') return restored === '' ? { action: 'delete' } : { action: 'conflict' };
  return { action: 'write', content: restored };
}
