/** One animation clock shared by the visible characters; no work when all are paused. */
export function createDockMotionClock(requestFrame, cancelFrame) {
  const subscribers = new Set();
  let frame = null;
  const tick = (now) => {
    frame = null;
    for (const subscriber of [...subscribers]) {
      if (!subscribers.has(subscriber)) continue;
      if (now - subscriber.previous < subscriber.interval - 1) continue;
      subscriber.previous = now;
      subscriber.paint(now);
    }
    if (subscribers.size && frame === null) frame = requestFrame(tick);
  };
  return {
    subscribe(paint, framesPerSecond = 30) {
      const subscriber = {
        paint,
        interval: 1000 / Math.max(1, Math.min(60, framesPerSecond)),
        previous: -Infinity,
      };
      subscribers.add(subscriber);
      if (frame === null) frame = requestFrame(tick);
      return () => {
        subscribers.delete(subscriber);
        if (!subscribers.size && frame !== null) {
          cancelFrame(frame);
          frame = null;
        }
      };
    },
    get size() {
      return subscribers.size;
    },
  };
}
