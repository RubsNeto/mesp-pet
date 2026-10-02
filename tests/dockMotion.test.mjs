import test from 'node:test';
import assert from 'node:assert/strict';
import { createDockMotionClock } from '../src/services/dockMotion.mjs';

function fixture() {
  let next = 0;
  const scheduled = new Map();
  const cancelled = [];
  const clock = createDockMotionClock(
    (callback) => {
      const id = next++;
      scheduled.set(id, callback);
      return id;
    },
    (id) => {
      cancelled.push(id);
      scheduled.delete(id);
    },
  );
  const frame = (time) => {
    assert.equal(scheduled.size, 1);
    const [id, callback] = scheduled.entries().next().value;
    scheduled.delete(id);
    callback(time);
  };
  return { clock, scheduled, cancelled, frame };
}

test('ten characters share one frame and cancelling the last subscriber stops it, including handle zero', () => {
  const { clock, scheduled, cancelled, frame } = fixture();
  let paints = 0;
  const stops = Array.from({ length: 10 }, () => clock.subscribe(() => paints++));
  assert.equal(clock.size, 10);
  assert.equal(scheduled.size, 1);
  frame(100);
  assert.equal(paints, 10);
  stops.forEach((stop) => stop());
  assert.equal(clock.size, 0);
  assert.equal(scheduled.size, 0);
  assert.equal(cancelled.length, 1);
  const stop = clock.subscribe(() => paints++);
  assert.equal(scheduled.size, 1);
  stop();
  const zero = fixture();
  zero.clock.subscribe(() => {})();
  assert.deepEqual(zero.cancelled, [0]);
});

test('each visible character keeps its own rate and a reduced-motion character paints less', () => {
  const { clock, frame } = fixture();
  const counts = [0, 0, 0];
  [30, 12, 5].forEach((fps, index) => clock.subscribe(() => counts[index]++, fps));
  for (let time = 0; time <= 1000; time += 1000 / 60) frame(time);
  assert.ok(counts[0] >= 29 && counts[0] <= 31, counts.join(','));
  assert.ok(counts[1] >= 11 && counts[1] <= 13, counts.join(','));
  assert.ok(counts[2] >= 5 && counts[2] <= 6, counts.join(','));
});

test('subscriptions changed during painting neither paint removed characters nor create a second frame', () => {
  const { clock, frame, scheduled } = fixture();
  const painted = [];
  let stopB;
  let stopA;
  stopA = clock.subscribe(() => {
    painted.push('a');
    stopB();
    stopA();
    clock.subscribe(() => painted.push('c'));
  });
  stopB = clock.subscribe(() => painted.push('b'));
  frame(0);
  assert.deepEqual(painted, ['a']);
  assert.equal(scheduled.size, 1);
  frame(100);
  assert.deepEqual(painted, ['a', 'c']);
});
