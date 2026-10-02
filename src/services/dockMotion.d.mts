export interface DockMotionClock {
  subscribe(paint: (now: number) => void, framesPerSecond?: number): () => void;
  readonly size: number;
}
export function createDockMotionClock(
  requestFrame: (callback: (now: number) => void) => number,
  cancelFrame: (id: number) => void,
): DockMotionClock;
