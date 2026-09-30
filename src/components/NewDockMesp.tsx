import { useEffect, useState } from 'react';
import { AI_PRESETS } from '../services/aiPresets';
import { projectName } from '../services/dockCore.mjs';

export interface NewDockProject {
  folder: string;
  name: string;
  title: string;
  agent: string;
}

export function NewDockMesp({
  currentFolder,
  defaultAgent,
  onClose,
  onCreate,
}: {
  currentFolder: string | null;
  defaultAgent: string;
  onClose: () => void;
  onCreate: (project: NewDockProject) => Promise<boolean>;
}) {
  const [folder, setFolder] = useState('');
  const [title, setTitle] = useState('');
  const [agent, setAgent] = useState(defaultAgent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [busy, onClose]);
  useEffect(() => {
    let active = true;
    void Promise.all(
      AI_PRESETS.filter((p) => p.id !== 'custom' && p.id !== 'mesp-code').map(async (p) => {
        const ok = await window.mesp?.checkCommand(p.command).catch(() => false);
        if (active) setInstalled((prev) => ({ ...prev, [p.id]: Boolean(ok) }));
      }),
    );
    return () => {
      active = false;
    };
  }, []);
  const pick = async () => {
    setBusy(true);
    setError('');
    try {
      const picked = await window.mesp?.selectFolder();
      if (picked) setFolder(picked);
    } catch {
      setError('Não foi possível escolher a pasta. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dock-project-overlay dock-new-overlay" role="dialog" aria-label="Novo MESP">
      <div className="dock-overlay-heading">
        <div>
          <strong>Novo MESP</strong>
          <p>Escolha o projeto e comece outra conversa.</p>
        </div>
        <button aria-label="Cancelar novo MESP" onClick={onClose}>
          ×
        </button>
      </div>
      <form
        className="dock-new-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!folder || busy) return;
          setBusy(true);
          void onCreate({ folder, name: projectName(folder), title: title.trim(), agent })
            .then((ok) => {
              if (!ok) setBusy(false);
            })
            .catch(() => {
              setError('Não foi possível criar o MESP.');
              setBusy(false);
            });
        }}
      >
        <label>
          Nome da tarefa <span className="dock-optional">opcional</span>
          <input
            autoFocus
            aria-label="Título do novo MESP"
            placeholder="Ex.: Ajustar o site da loja"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="dock-new-fields">
          <label>
            Agente
            <select
              aria-label="Agente do novo MESP"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            >
              {AI_PRESETS.filter(
                (p) =>
                  p.id !== 'custom' &&
                  (p.id === agent ||
                    installed[p.id] === true ||
                    (installed[p.id] !== false && ['codex', 'claude'].includes(p.id))),
              ).map((p) => (
                <option key={p.id} value={p.id} disabled={installed[p.id] === false}>
                  {p.name}
                  {installed[p.id] === false ? ' · não instalado' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="dock-new-folder">
            <span>Pasta do projeto</span>
            <button
              type="button"
              onClick={() => void pick()}
              disabled={busy}
              aria-label="Escolher pasta do novo MESP"
            >
              {folder ? projectName(folder) : 'Escolher pasta…'}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
        {folder && (
          <p className="dock-folder-path" title={folder}>
            {folder}
          </p>
        )}
        {currentFolder && !folder && (
          <button
            className="dock-use-folder"
            type="button"
            onClick={() => setFolder(currentFolder)}
          >
            Usar o mesmo projeto: {projectName(currentFolder)}
          </button>
        )}
        {error && (
          <p className="dock-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dock-new-bottom">
          <span>Os outros MESP continuam trabalhando.</span>
          <button
            className="dock-create-button"
            disabled={!folder || busy || installed[agent] === false}
            type="submit"
          >
            {busy ? 'Abrindo…' : '+ Criar MESP'}
          </button>
        </div>
      </form>
    </div>
  );
}
