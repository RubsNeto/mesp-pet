import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTs(file) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const { Spring, Tracked } = await importTs('../src/coucou/anim.ts');
const { IslandStateMachine } = await importTs('../src/coucou/fsm.ts');

test('Coucou opening spring settles after irregular frame delays without instability', () => {
  const spring = new Spring(288);
  spring.target = 1180;
  for (let i = 0; i < 240; i++) spring.step(i % 7 === 0 ? 0.12 : 1 / 60);
  assert.ok(spring.settled);
  assert.ok(Math.abs(spring.value - 1180) < 0.01);
  assert.ok(Number.isFinite(spring.value));
});
test('closing curve reaches compact geometry in 340ms and reduced motion jumps immediately', () => {
  const size = new Tracked(1180);
  size.curveTowards(288, 340, 1000);
  size.step(0.016, 1170);
  assert.ok(size.value > 288 && size.value < 1180);
  size.step(0.016, 1340);
  assert.equal(size.value, 288);
  assert.equal(size.animating, false);
  size.springTo(1180);
  size.jump(640);
  assert.equal(size.value, 640);
  assert.equal(size.animating, false);
});
test('island lifecycle retains hover, pin and explicit collapse behavior', () => {
  let next = 0;
  const callbacks = new Map();
  globalThis.window = {
    setTimeout(fn) {
      callbacks.set(++next, fn);
      return next;
    },
    clearTimeout(id) {
      callbacks.delete(id);
    },
  };
  const fsm = new IslandStateMachine();
  fsm.launch();
  assert.equal(fsm.state, 'coucou');
  fsm.greetComplete();
  assert.equal(callbacks.size, 1);
  for (const fn of [...callbacks.values()]) fn();
  callbacks.clear();
  assert.equal(fsm.state, 'petit');
  fsm.click();
  assert.equal(fsm.state, 'home');
  fsm.pinned = true;
  fsm.mouseLeft();
  assert.equal(callbacks.size, 0);
  fsm.pinned = false;
  fsm.mouseLeft();
  assert.equal(callbacks.size, 1);
  fsm.mouseEntered();
  assert.equal(callbacks.size, 0);
  fsm.forcePetit();
  fsm.mouseLeft();
  assert.equal(callbacks.size, 1);
  for (const fn of [...callbacks.values()]) fn();
  callbacks.clear();
  assert.equal(fsm.state, 'hidden');
  fsm.reveal();
  assert.equal(fsm.state, 'petit');
  fsm.cancelTimers();
  assert.equal(callbacks.size, 0);
  delete globalThis.window;
});
