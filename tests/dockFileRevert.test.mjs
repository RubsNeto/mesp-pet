import test from 'node:test';
import assert from 'node:assert/strict';
import { reversePatch, revertFilePlan } from '../electron/dockFileRevert.mjs';

const modified = [
  'Index: app.js',
  '===================================================================',
  '--- app.js',
  '+++ app.js',
  '@@ -1,4 +1,4 @@',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
  ' export { a, b };',
  '-// end',
  '',
].join('\n');

test('a modified file goes back to its previous content', () => {
  const after = 'const a = 1;\nconst b = 3;\nconst c = 4;\nexport { a, b };\n';
  assert.equal(
    reversePatch(after, modified),
    'const a = 1;\nconst b = 2;\nexport { a, b };\n// end\n',
  );
});

test('CRLF files keep CRLF when patch lines come without carriage returns', () => {
  const after = 'const a = 1;\r\nconst b = 3;\r\nconst c = 4;\r\nexport { a, b };\r\n';
  assert.equal(
    reversePatch(after, modified),
    'const a = 1;\r\nconst b = 2;\r\nexport { a, b };\r\n// end\r\n',
  );
});

test('edits made after the agent step block the revert', () => {
  const edited = 'const a = 1;\nconst b = 99;\nconst c = 4;\nexport { a, b };\n';
  assert.equal(reversePatch(edited, modified), null);
  assert.deepEqual(
    revertFilePlan({ status: 'modified', patch: modified, current: edited, exists: true }),
    { action: 'conflict' },
  );
});

test('a file the agent created is deleted, a file it deleted comes back', () => {
  const added = '--- /dev/null\n+++ novo.txt\n@@ -0,0 +1,2 @@\n+oi\n+tchau\n';
  assert.deepEqual(
    revertFilePlan({ status: 'added', patch: added, current: 'oi\ntchau\n', exists: true }),
    { action: 'delete' },
  );
  assert.deepEqual(revertFilePlan({ status: 'added', patch: added, current: '', exists: false }), {
    action: 'unchanged',
  });
  const deleted = '--- velho.txt\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-um\n-dois\n';
  assert.deepEqual(
    revertFilePlan({ status: 'deleted', patch: deleted, current: '', exists: false }),
    { action: 'write', content: 'um\ndois\n' },
  );
});

test('missing final newline markers are respected', () => {
  const patch = '@@ -1,1 +1,1 @@\n-fim\n\\ No newline at end of file\n+fim novo\n';
  assert.equal(reversePatch('fim novo\n', patch), 'fim');
});

test('before/after content from OpenCode is used directly when present', () => {
  assert.deepEqual(
    revertFilePlan({
      status: 'modified',
      patch: '',
      before: 'a',
      after: 'b',
      current: 'b',
      exists: true,
    }),
    { action: 'write', content: 'a' },
  );
  assert.deepEqual(
    revertFilePlan({
      status: 'modified',
      patch: '',
      before: 'a',
      after: 'b',
      current: 'c',
      exists: true,
    }),
    { action: 'conflict' },
  );
});
