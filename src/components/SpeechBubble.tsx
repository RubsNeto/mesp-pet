// src/components/SpeechBubble.tsx
//
// Balão de resumo. Aparece acima do pet com a frase curta gerada pelo summarize.
// Clique abre o painel completo.

import type { PetTask } from '../types';

export interface SpeechBubbleProps {
  task: PetTask;
  onClick: () => void;
}

export function SpeechBubble({ task, onClick }: SpeechBubbleProps) {
  const tone = task.status === 'success'
    ? 'success'
    : task.status === 'error'
    ? 'error'
    : '';
  return (
    <div
      className={`bubble interactive ${tone}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Resumo: ${task.summary}`}
    >
      <div className="bubble-text">{task.summary || '...'}</div>
      <div className="bubble-hint">clique para detalhes</div>
    </div>
  );
}
