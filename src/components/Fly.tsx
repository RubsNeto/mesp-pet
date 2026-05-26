// src/components/Fly.tsx
// Renders a fly that buzzes around the screen for the pet to chase.

import { memo } from 'react';

export interface FlyEntity {
  id: string;
  x: number;
  y: number;
}

export interface FlyProps {
  fly: FlyEntity;
}

function FlyComponent({ fly }: FlyProps) {
  return (
    <div
      className="fly"
      style={{ left: fly.x, top: fly.y }}
      aria-hidden
    >
      🦟
    </div>
  );
}

export const Fly = memo(FlyComponent);
