// src/hooks/usePetAnimation.ts
//
// Hook responsável por ciclar entre os frames de animação do pet, de acordo com
// o estado atual. Otimizado para não disparar re-render quando o frame
// (URL do sprite) não muda — importante porque o idle tem muitos frames
// repetidos do mesmo sprite para criar a sensação de "parado".

import { useEffect, useRef, useState } from 'react';
import { STATE_FPS, STATE_FRAMES } from '../assets/sprites';
import type { PetState } from '../types';

export interface UsePetAnimationResult {
  frame: string;
}

export function usePetAnimation(state: PetState): UsePetAnimationResult {
  const frames = STATE_FRAMES[state] ?? STATE_FRAMES.idle;
  const [frame, setFrame] = useState<string>(frames[0]!);
  const indexRef = useRef(0);
  const stateRef = useRef<PetState>(state);

  // Reseta ao trocar de estado.
  useEffect(() => {
    stateRef.current = state;
    indexRef.current = 0;
    const newFrames = STATE_FRAMES[state] ?? STATE_FRAMES.idle;
    setFrame(newFrames[0]!);
  }, [state]);

  // Ciclo de animação: só dispara setFrame quando o sprite efetivamente muda.
  useEffect(() => {
    const fps = STATE_FPS[state] ?? 4;
    const intervalMs = Math.max(60, Math.floor(1000 / fps));
    const id = setInterval(() => {
      const curFrames = STATE_FRAMES[stateRef.current] ?? STATE_FRAMES.idle;
      if (curFrames.length <= 1) return;
      indexRef.current = (indexRef.current + 1) % curFrames.length;
      const nextFrame = curFrames[indexRef.current]!;
      setFrame((prev) => (prev === nextFrame ? prev : nextFrame));
    }, intervalMs);
    return () => clearInterval(id);
  }, [state]);

  return { frame };
}
