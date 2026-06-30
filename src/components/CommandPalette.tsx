// src/components/CommandPalette.tsx
//
// Paleta de comandos (Ctrl+K): overlay com busca por subsequencia e navegacao
// por teclado. A filtragem pura vive em ../services/commandPalette (testada).

import { useEffect, useMemo, useRef, useState } from 'react';
import { filterCommands } from '../services/commandPalette';
import type { PaletteCommand } from '../services/commandPalette';

export interface CommandPaletteProps {
  commands: PaletteCommand[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setIndex(0);
  }, [query]);

  const run = (cmd?: PaletteCommand) => {
    if (!cmd || cmd.disabled) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(filtered[index]);
    }
  };

  return (
    <div className="cmdk-backdrop interactive" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Paleta de comandos">
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Buscar comando..."
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul className="cmdk-list">
          {filtered.map((c, i) => (
            <li
              key={c.id}
              className={`cmdk-item${i === index ? ' active' : ''}${c.disabled ? ' disabled' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(c)}
            >
              <span className="cmdk-label">{c.label}</span>
              {c.hint && <span className="cmdk-hint">{c.hint}</span>}
            </li>
          ))}
          {filtered.length === 0 && <li className="cmdk-empty muted small">Nenhum comando</li>}
        </ul>
      </div>
    </div>
  );
}