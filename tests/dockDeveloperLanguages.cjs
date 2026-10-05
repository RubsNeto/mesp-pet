const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const execute = promisify(execFile);
const root = path.resolve(__dirname, '..');

(async () => {
  const { inspectDeveloperProject, runDeveloperChecks } = await import(
    pathToFileURL(path.join(root, 'electron/dockDeveloper.mjs'))
  );
  const profile = path.join(root, 'qa', `languages-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  const fixtures = {
    python: {
      'test_calc.py':
        'import unittest\nclass Addition(unittest.TestCase):\n def test_sum(self): self.assertEqual(2+3,5)\n',
    },
    go: {
      'go.mod': 'module example.invalid/mespqa\n\ngo 1.22\n',
      'add.go': 'package mespqa\nfunc Add(a,b int) int { return a+b }\n',
      'add_test.go':
        'package mespqa\nimport "testing"\nfunc TestAdd(t *testing.T) { if Add(2,3)!=5 { t.Fatal("addition is wrong") } }\n',
    },
    rust: {
      'Cargo.toml': '[package]\nname="mespqa"\nversion="0.1.0"\nedition="2021"\n',
      'src/lib.rs':
        'pub fn add(a:i32,b:i32)->i32{a+b}\n#[cfg(test)] mod tests{use super::*; #[test] fn addition(){assert_eq!(add(2,3),5);}}\n',
    },
  };
  const results = [];
  for (const [language, files] of Object.entries(fixtures)) {
    const cwd = path.join(profile, language);
    fs.mkdirSync(cwd, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(cwd, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const inspected = await inspectDeveloperProject(cwd);
    const checked = await runDeveloperChecks(inspected, {
      signal: new AbortController().signal,
      deadline: Infinity,
      execute: async (check, _manager, timeout) => {
        assert.equal(timeout, 0);
        const command = check.kind === 'python' ? 'python' : check.command;
        const args =
          check.kind === 'python'
            ? [
                '-c',
                'import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8-sig").read())',
                check.file,
              ]
            : check.args;
        try {
          const result = await execute(command, args, {
            cwd,
            windowsHide: true,
            maxBuffer: 256000,
            env: { ...process.env, CARGO_NET_OFFLINE: 'true', GOPROXY: 'off' },
          });
          return { code: 0, output: result.stdout + result.stderr };
        } catch (error) {
          return {
            code: typeof error.code === 'number' ? error.code : null,
            output: error.message + '\n' + (error.stdout || '') + (error.stderr || ''),
          };
        }
      },
    });
    assert.equal(checked.passed, true, JSON.stringify(checked));
    assert.ok(
      checked.results.some((check) => /(?:test|unittest)/.test(check.name)),
      'At least one real test ran',
    );
    // A deliberate defect proves this is a functional verifier, rather than a smoke-only command.
    const source =
      language === 'go' ? 'add.go' : language === 'rust' ? 'src/lib.rs' : 'test_calc.py';
    const target = path.join(cwd, source);
    fs.writeFileSync(
      target,
      fs
        .readFileSync(target, 'utf8')
        .replace('return a+b', 'return a-b')
        .replace('->i32{a+b}', '->i32{a-b}')
        .replace('self.assertEqual(2+3,5)', 'self.assertEqual(2+3,4)'),
    );
    const tests = checked.results.map((check) => check.name);
    const verify = await inspectDeveloperProject(cwd);
    const failed = await runDeveloperChecks(verify, {
      signal: new AbortController().signal,
      deadline: Infinity,
      execute: async (check) => {
        if (!/(?:test|unittest)/.test(check.name))
          return { code: 0, output: 'Covered in preceding pass' };
        try {
          const result = await execute(check.command, check.args, {
            cwd,
            windowsHide: true,
            maxBuffer: 256000,
            env: { ...process.env, CARGO_NET_OFFLINE: 'true', GOPROXY: 'off' },
          });
          return { code: 0, output: result.stdout + result.stderr };
        } catch (error) {
          return { code: error.code, output: (error.stdout || '') + (error.stderr || '') };
        }
      },
    });
    assert.equal(failed.passed, false, `${language} must detect the deliberate defect`);
    results.push({ language, tests, passed: true, detectsDefect: true });
  }
  const evidence = { passed: true, profile, runtimes: results };
  fs.writeFileSync(path.join(profile, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
