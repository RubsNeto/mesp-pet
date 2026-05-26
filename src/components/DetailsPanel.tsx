// src/components/DetailsPanel.tsx
//
// Painel de detalhes mostrado ao clicar no pet/balão.
// Inclui título, status, horário, resumo, resposta completa e botão de copiar.

import { useEffect, useState } from 'react';
import type { PetTask } from '../types';

export interface DetailsPanelProps {
  task: PetTask;
  onClose: () => void;
}

export function DetailsPanel({ task, onClose }: DetailsPanelProps) {
  const [copied, setCopied] = useState(false);

  // Fecha com Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(task.fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: cria textarea, copia, remove.
      const ta = document.createElement('textarea');
      ta.value = task.fullText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* noop */
      }
      document.body.removeChild(ta);
    }
  }

  return (
    <div
      className="panel-backdrop interactive"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">{task.title}</div>
          <span className={`panel-status ${task.status}`}>{task.status}</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {new Date(task.createdAt).toLocaleTimeString()}
          </span>
        </div>

        <div className="panel-body">
          <div className="panel-section">
            <h4>Resumo</h4>
            <p>{task.summary || '(sem resumo)'}</p>
          </div>

          <div className="panel-section">
            <h4>Resposta completa</h4>
            <pre className="panel-pre">{task.fullText || '(sem conteúdo)'}</pre>
          </div>

          {task.error && (
            <div className="panel-section">
              <h4>Erro</h4>
              <pre className="panel-pre">{task.error}</pre>
            </div>
          )}
        </div>

        <div className="panel-footer">
          <button className="btn" onClick={copy} aria-label="Copiar resposta">
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <button className="btn primary" onClick={onClose} aria-label="Fechar painel">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
