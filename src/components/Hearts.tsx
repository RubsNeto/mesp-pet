// src/components/Hearts.tsx
// Renders floating hearts that animate upward and fade out.

import { useEffect, useState } from 'react';

export interface Heart {
  id: number;
  x: number;
  y: number;
}

export interface HeartsProps {
  hearts: Heart[];
  onExpire: (id: number) => void;
}

export function Hearts({ hearts, onExpire }: HeartsProps) {
  return (
    <>
      {hearts.map((h) => (
        <FloatingHeart key={h.id} heart={h} onExpire={onExpire} />
      ))}
    </>
  );
}

function FloatingHeart({ heart, onExpire }: { heart: Heart; onExpire: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onExpire(heart.id), 1500);
    return () => clearTimeout(t);
  }, [heart.id, onExpire]);

  // Random horizontal drift
  const [drift] = useState(() => (Math.random() - 0.5) * 40);

  return (
    <div
      className="floating-heart"
      style={{
        left: heart.x,
        top: heart.y,
        ['--drift' as string]: `${drift}px`,
      }}
      aria-hidden
    >
      ❤
    </div>
  );
}
