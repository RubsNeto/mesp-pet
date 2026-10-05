const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'qa', `validation-${Date.now()}`);
fs.mkdirSync(directory, { recursive: true });
const checks = [
  'test',
  'lint',
  'build',
  'test:agent',
  'test:routing',
  'test:usability',
  'test:history',
  'test:settings',
  'test:router',
  'test:router:auto',
  'test:performance',
  'test:audit',
  'test:projects',
];
const results = [];
async function run(name) {
  const started = Date.now();
  const log = fs.createWriteStream(path.join(directory, name.replaceAll(':', '-') + '.log'));
  const child = spawn(
    process.execPath,
    [path.join(root, 'node_modules/npm/bin/npm-cli.js'), 'run', name],
    { cwd: root, windowsHide: true, shell: false, env: { ...process.env } },
  );
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const code = await new Promise((resolve) => {
    child.once('error', (error) => {
      log.write(error.message);
      resolve(1);
    });
    child.once('close', resolve);
  });
  await new Promise((resolve) => log.end(resolve));
  results.push({ name, passed: code === 0, code, durationMs: Date.now() - started });
  fs.writeFileSync(
    path.join(directory, 'results.json'),
    JSON.stringify({ directory, results }, null, 2),
  );
  console.log(
    `${code === 0 ? 'PASS' : 'FAIL'} ${name} (${Math.round((Date.now() - started) / 1000)}s)`,
  );
  return code === 0;
}
(async () => {
  console.log(`Validation logs: ${directory}`);
  for (const name of checks) {
    const passed = await run(name);
    if (!passed && ['test', 'lint', 'build'].includes(name)) break;
  }
  if (results.length !== checks.length || results.some((result) => !result.passed))
    process.exitCode = 1;
  console.log(`${results.filter((result) => result.passed).length}/${checks.length} checks passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
