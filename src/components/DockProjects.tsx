import { memo, useLayoutEffect, useRef, useState } from 'react';
import { DockMascot } from './DockMascot';
import { getPresetById } from '../services/aiPresets';
import {
  dockProjectStatus,
  unreadDockResult,
  type DockProjectGroup,
} from '../services/dockCore.mjs';
import type { PetEntity } from '../types';

export type ProjectFilter = 'all' | DockProjectGroup;
const FILTERS: Array<{ id: ProjectFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Em andamento' },
  { id: 'attention', label: 'Atenção' },
  { id: 'completed', label: 'Concluídos' },
];
function description(project: PetEntity) {
  return `${project.projectName} · ${project.taskTitle || 'Sem tarefa'} · ${dockProjectStatus(project).label}${unreadDockResult(project) ? ' · Resultado novo' : ''}`;
}
function ProjectIcon({ project, active = true }: { project: PetEntity; active?: boolean }) {
  return (
    <span className="dock-project-mascot" aria-hidden="true">
      <DockMascot
        traits={project.traits}
        state={project.state}
        emote="happy"
        reaction={0}
        mini
        active={active}
        animated={false}
      />
    </span>
  );
}
export const DockProjectSwitcher = memo(function DockProjectSwitcher({
  projects,
  selectedId,
  active,
  compact = false,
  onSelect,
}: {
  projects: PetEntity[];
  selectedId: string;
  active: boolean;
  compact?: boolean;
  onSelect: (id: string) => void;
}) {
  const strip = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!active) return;
    strip.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId, active]);
  return (
    <nav
      ref={strip}
      className={`dock-project-switcher${compact ? ' is-compact' : ''}`}
      aria-label="Trocar de projeto"
    >
      {projects.map((project) => (
        <button
          key={project.id}
          data-project-id={project.id}
          aria-current={project.id === selectedId ? 'true' : undefined}
          aria-label={description(project)}
          title={description(project)}
          onClick={() => onSelect(project.id)}
        >
          <ProjectIcon project={project} active={active} />
          <strong>{project.taskTitle || project.projectName || 'Novo MESP'}</strong>
          {project.taskTitle && project.taskTitle !== project.projectName && (
            <small className="dock-switcher-system">{project.projectName || 'Sem pasta'}</small>
          )}
          <small>
            {unreadDockResult(project) ? '✓ Novo resultado' : dockProjectStatus(project).label}
          </small>
        </button>
      ))}
    </nav>
  );
});
export function DockProjects({
  projects,
  selectedId,
  filter,
  onFilter,
  onSelect,
  onClose,
  onAdd,
  addingDisabled,
}: {
  projects: PetEntity[];
  selectedId: string;
  filter: ProjectFilter;
  onFilter: (value: ProjectFilter) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  onAdd: () => void;
  addingDisabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [filter, query]);
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const visible = projects.filter(
    (project) =>
      (filter === 'all' || dockProjectStatus(project).group === filter) &&
      normalize(
        `${project.projectName} ${project.taskTitle} ${getPresetById(project.agentPresetId || '')?.name}`,
      ).includes(normalize(query.trim())),
  );
  const ordered = [...visible].sort((a, b) => {
    const priority = (p: PetEntity) =>
      unreadDockResult(p) ? 0 : dockProjectStatus(p).group === 'attention' ? 1 : 2;
    return priority(a) - priority(b) || (b.completedAt || 0) - (a.completedAt || 0);
  });
  return (
    <div
      ref={panel}
      className="dock-project-overlay dock-projects-overview"
      role="region"
      aria-label="Seus MESP"
    >
      <div className="dock-project-toolbar">
        <div className="dock-overlay-heading">
          <strong>Seus MESP</strong>
          <button aria-label="Voltar à conversa" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dock-project-filters" aria-label="Filtrar tarefas">
          {FILTERS.map(({ id, label }) => (
            <button key={id} aria-pressed={filter === id} onClick={() => onFilter(id)}>
              {label}{' '}
              <span>
                {projects.filter((p) => id === 'all' || dockProjectStatus(p).group === id).length}
              </span>
            </button>
          ))}
        </div>
        <input
          className="dock-project-search"
          aria-label="Buscar projeto ou tarefa"
          placeholder="Buscar projeto ou tarefa…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="dock-project-grid">
        {ordered.map((project) => (
          <button
            key={project.id}
            data-project-id={project.id}
            className={`dock-project ${project.id === selectedId ? 'selected' : ''}`}
            aria-label={description(project)}
            title={description(project)}
            onClick={() => onSelect(project.id)}
          >
            <ProjectIcon project={project} />
            <span className="dock-project-copy">
              <small className="dock-project-name">{project.projectName || 'Novo MESP'}</small>
              <strong>{project.taskTitle || 'Envie uma tarefa'}</strong>
              <small>
                {getPresetById(project.agentPresetId || '')?.name} ·{' '}
                {dockProjectStatus(project).label}
              </small>
              {project.completedAt && (
                <small
                  className="dock-project-result"
                  title={new Date(project.completedAt).toLocaleString('pt-BR')}
                >
                  {unreadDockResult(project) ? '✓ Novo resultado · abrir' : '✓ Ver resultado'}
                </small>
              )}
              {project.taskInterrupted && (
                <small>Sessão encerrada. Confira a conversa antes de continuar.</small>
              )}
            </span>
            {dockProjectStatus(project).group === 'active' && (
              <span className="dock-working" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      {!ordered.length && (
        <div className="dock-project-empty" role="status">
          <p>{query ? 'Nenhum projeto ou tarefa encontrado.' : 'Nenhuma tarefa nesta situação.'}</p>
          <button
            onClick={() => {
              setQuery('');
              onFilter('all');
            }}
          >
            Ver todos os MESP
          </button>
        </div>
      )}
      <button className="dock-inline-new" disabled={addingDisabled} onClick={onAdd}>
        + Novo MESP
      </button>
    </div>
  );
}
