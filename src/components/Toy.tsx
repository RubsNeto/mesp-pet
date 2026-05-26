// src/components/Toy.tsx
// Renders a ball toy on the screen that pets can chase.

import { memo } from 'react';

export interface ToyEntity {
  id: string;
  x: number;
  y: number;
}

export interface ToyProps {
  toy: ToyEntity;
  onRemove: (id: string) => void;
}

function ToyComponent({ toy, onRemove }: ToyProps) {
  return (
    <div
      className="toy interactive"
      style={{ left: toy.x, top: toy.y }}
      onContextMenu={(e) => {
        e.preventDefault();
        onRemove(toy.id);
      }}
      title="Bolinha (clique direito para remover)"
      aria-label="Bolinha"
    >
      🎾
    </div>
  );
}

export const Toy = memo(ToyComponent);
