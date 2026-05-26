// src/hooks/usePetAnimation.ts
//
// Hook responsável por ciclar entre os frames de animação do pet, de acordo com
// o estado atual e traits visuais.

import { useEffect, useRef, useState } from 'react';
import { STATE_FPS, STATE_FRAMES, getSpritesForTraits } from '../assets/sprites';
import type { MespTraits } from '../procedural/traits';
import type { PetState } from '../types';

export interface UsePetAnimationResult {
  frame: string;
}

export function usePetAnimation(state: PetState, traits?: MespTraits): UsePetAnimationResult {
  const spriteSet = traits ? getSpritesForTraits(traits) : null;
  const framesMap = spriteSet?.frames ?? STATE_FRAMES;
  const fpsMap = spriteSet?.fps ?? STATE_FPS;

  const frames = framesMap[state] ?? framesMap.idle;
  const [frame, setFrame] = useState<string>(frames[0]!);
  const indexRef = useRef(0);
  const stateRef = useRef<PetState>(state);
  const framesRef = useRef(frames);

  useEffect(() => {
    stateRef.current = state;
    const newFrames = framesMap[state] ?? framesMap.idle;
    framesRef.current = newFrames;
    indexRef.current = 0;
    setFrame(newFrames[0]!);
  }, [state, framesMap]);

  useEffect(() => {
    const fps = fpsMap[state] ?? 4;
    const intervalMs = Math.max(60, Math.floor(1000 / fps));
    const id = setInterval(() => {
      const curFrames = framesRef.current;
      if (curFrames.length <= 1) return;
      indexRef.current = (indexRef.current + 1) % curFrames.length;
      const nextFrame = curFrames[indexRef.current]!;
      setFrame((prev) => (prev === nextFrame ? prev : nextFrame));
    }, intervalMs);
    return () => clearInterval(id);
  }, [state, fpsMap]);

  return { frame };
}
