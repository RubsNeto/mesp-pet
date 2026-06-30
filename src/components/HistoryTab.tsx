// src/components/HistoryTab.tsx
//
// Aba "Historico": estatisticas da sessao, timeline de execucoes (runs),
// git status + diff best-effort, e export do transcript.

import { useCallback, useEffect, useState } from 'react';
import type { RunRecord } from '../services/runLog';
import { summarizeRuns } from '../services/runLog';
import { formatCost } from '../services/costParse';

export interface HistoryTabProps {
  workDir: string | null;
  runs: RunRecord[];
  onExport: () => void;
  onClearRuns: () => void;
}

interface GitInfo {
  branch: string;
  changed: number;
  files: string[];
}

const STATUS_LABEL: Record<string, string> = {
  running: 'em andamento',
  success: 'sucesso',
  error: 'erro',
  done: 'concluido',
};

function fmtDuration(ms: number | null): string {
  if (ms == null) return '...';
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s * 10) / 10}s`;
  return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return '';
  }
}

export function HistoryTab({ workDir, runs, onExport, onClearRuns }: HistoryTabProps) {
  const [git, setGit] = useState<GitInfo | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [gitLoading, setGitLoading] = useState(false);

  const refreshGit = useCallback(() => {
    if (!workDir || !window.mesp?.gitStatus) {
      setGit(null);
      setDiff(null);
      return;
    }
    setGitLoading(true);
    void window.mesp.gitStatus(workDir).then((g) => setGit(g)).finally(() => setGitLoading(false));
    if (window.mesp.gitDiff) void window.mesp.gitDiff(workDir).then((d) => setDiff(d));
  }, [workDir]);

  useEffect(() => {
    refreshGit();
  }, [refreshGit]);

  const reversed = [...runs].reverse();
  const stats = summarizeRuns(runs);
  const statsCost = formatCost(stats.cost);

  return (
    <div className="cockpit-pane">
      <section className="cockpit-section">
        <h4>Resumo da sessao</h4>
        <div className="stats-row">
          <span className="stat"><b>{stats.total}</b> execucoes</span>
          <span className="stat stat-ok"><b>{stats.success}</b> ok</span>
          <span className="stat stat-err"><b>{stats.error}</b> erros</span>
          <span className="stat"><b>{fmtDuration(stats.totalMs)}</b> total</span>
          {statsCost && <span className="stat">{statsCost}</span>}
        </div>
      </section>

      <section className="cockpit-section">
        <div className="cockpit-section-head">
          <h4>Mudancas no projeto (git)</h4>
          <button className="btn-icon small" title="Atualizar" onClick={refreshGit}>R</button>
        </div>
        {!workDir && <p className="muted small">Sem pasta de trabalho definida.</p>}
        {workDir && gitLoading && <p className="muted small">Lendo git...</p>}
        {workDir && !gitLoading && !git && <p className="muted small">Nao e um repositorio git (ou git ausente).</p>}
        {git && (
          <div className="git-box">
            <div className="git-head">
              <span className="git-branch">{git.branch || '(branch?)'}</span>
              <span className="muted small">{git.changed} alterado(s)</span>
            </div>
            <ul className="git-files">
              {git.files.slice(0, 30).map((f, i) => (
                <li key={i} className="mono small">{f}</li>
              ))}
              {git.files.length === 0 && <li className="muted small">Arvore limpa.</li>}
            </ul>
            {diff && (
              <pre className="git-diff mono small">{diff.slice(0, 4000)}</pre>
            )}
          </div>
        )}
      </section>

      <section className="cockpit-section">
        <div className="cockpit-section-head">
          <h4>Execucoes</h4>
          <div>
            <button className="btn-icon small" title="Exportar transcript" onClick={onExport}>exportar</button>
            <button className="btn-icon small" title="Limpar historico" onClick={onClearRuns}>limpar</button>
          </div>
        </div>
        {reversed.length === 0 && <p className="muted small">Nenhuma execucao registrada ainda.</p>}
        <ul className="run-list">
          {reversed.map((r) => (
            <li key={r.id} className={`run-item run-${r.status}`}>
              <span className="run-dot" aria-hidden />
              <span className="run-status">{STATUS_LABEL[r.status] ?? r.status}</span>
              <span className="run-time muted small">{fmtTime(r.startedAt)}</span>
              <span className="run-dur">{fmtDuration(r.durationMs)}</span>
              {r.cost && formatCost(r.cost) && <span className="run-cost muted small">{formatCost(r.cost)}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}