// src/components/BroadcastBar.tsx
//
// Barra para enviar o mesmo prompt a todos os agentes ativos (broadcast).

import { useEffect, useRef, useState } from 'react';

export interface BroadcastBarProps {
  onSubmit: (text: string) => void;
  onClose: () => void;
}

export function BroadcastBar({ onSubmit, onClose }: BroadcastBarProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text);
    onClose();
  };

  return (
    <div className="cmdk-backdrop interactive" onClick={onClose}>
      <div className="cmdk broadcast" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Broadcast">
        <div className="broadcast-title">Enviar a todos os agentes</div>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Digite o prompt e Enter..."
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            else if (e.key === 'Enter') { e.preventDefault(); submit(); }
          }}
        />
      </div>
    </div>
  );
}