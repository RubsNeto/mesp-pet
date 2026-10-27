import { useCallback, useEffect, useState } from 'react';
type MespApi = NonNullable<Window['mesp']>;
type AppUpdateState = Awaited<ReturnType<MespApi['getAppUpdate']>>;
type ExtensionsSnapshot = Awaited<ReturnType<MespApi['listExtensions']>>;
type ProjectPermissionRules = Awaited<ReturnType<MespApi['listPermissionRules']>>[number];

const PERMISSION_NAMES: Record<string, string> = {
  bash: 'Comandos',
  edit: 'Editar arquivos',
  write: 'Criar arquivos',
  webfetch: 'Acessar a web',
  external_directory: 'Pastas fora do projeto',
};

function updateText(state: AppUpdateState | null): string {
  if (!state) return 'Verificando versão…';
  switch (state.status) {
    case 'off':
      return 'Execução pelo código-fonte. Atualizações automáticas valem no app instalado.';
    case 'checking':
      return 'Procurando atualizações…';
    case 'downloading':
      return `Baixando a versão ${state.next} · ${state.percent}%`;
    case 'ready':
      return `A versão ${state.next} está pronta para instalar.`;
    case 'manual':
      return `A versão ${state.next} está disponível para download.`;
    case 'error':
      return state.message;
    case 'current':
      return 'Você está na versão mais recente.';
    default:
      return 'Atualizações automáticas ativas.';
  }
}

export function DockAppSettings() {
  const api = window.mesp;
  const [update, setUpdate] = useState<AppUpdateState | null>(null);
  const [extensions, setExtensions] = useState<ExtensionsSnapshot>({ mcp: [], skills: [] });
  const [rules, setRules] = useState<ProjectPermissionRules[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'local' as 'local' | 'remote',
    command: '',
    url: '',
  });
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!api?.listExtensions) return;
    const [nextUpdate, nextExtensions, nextRules] = await Promise.all([
      api.getAppUpdate(),
      api.listExtensions(),
      api.listPermissionRules(),
    ]);
    setUpdate(nextUpdate);
    setExtensions(nextExtensions);
    setRules(nextRules);
  }, [api]);

  useEffect(() => {
    void reload();
    return api?.onAppUpdate?.(setUpdate);
  }, [api, reload]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const applySnapshot = (result: { ok: boolean } & Partial<ExtensionsSnapshot>) => {
    if (result.ok && result.mcp && result.skills) {
      setExtensions({ mcp: result.mcp, skills: result.skills });
      return true;
    }
    return false;
  };

  const saveServer = async () => {
    if (!api || busy) return;
    setBusy(true);
    setFormError('');
    try {
      const result = await api.addMcpServer(form);
      if (applySnapshot(result)) {
        setAdding(false);
        setForm({ name: '', type: 'local', command: '', url: '' });
        setNotice('Servidor adicionado. Vale a partir da próxima tarefa.');
      } else setFormError(('error' in result && result.error) || 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  const updateAction =
    update?.status === 'ready'
      ? 'Reiniciar e atualizar'
      : update?.status === 'manual'
        ? 'Baixar nova versão'
        : update?.status === 'off'
          ? null
          : 'Procurar atualizações';

  return (
    <div className="dock-app-settings">
      <section className="dock-app-card dock-app-update" aria-label="Versão e atualizações">
        <div>
          <strong>MESP {update?.version ?? ''}</strong>
          <p aria-live="polite">{updateText(update)}</p>
          {update?.status === 'downloading' && (
            <progress max="100" value={update.percent} aria-label="Progresso do download" />
          )}
        </div>
        {updateAction && (
          <button
            type="button"
            className={
              update?.status === 'ready' || update?.status === 'manual' ? 'is-primary' : ''
            }
            disabled={update?.status === 'checking' || update?.status === 'downloading'}
            onClick={() =>
              void (update?.status === 'ready' || update?.status === 'manual'
                ? api?.installAppUpdate()
                : api?.checkAppUpdate().then(setUpdate))
            }
          >
            {updateAction}
          </button>
        )}
      </section>

      <div className="dock-settings-section-heading">
        <h3>
          Servidores MCP <span>{extensions.mcp.length || ''}</span>
        </h3>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}>
            Adicionar
          </button>
        )}
      </div>
      {adding && (
        <form
          className="dock-app-card dock-mcp-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveServer();
          }}
        >
          <label>
            Nome
            <input
              autoFocus
              value={form.name}
              placeholder="github"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <div className="dock-mcp-type" role="radiogroup" aria-label="Tipo de servidor">
            {(
              [
                ['local', 'Comando local'],
                ['remote', 'URL remota'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={form.type === id}
                onClick={() => setForm({ ...form, type: id })}
              >
                {label}
              </button>
            ))}
          </div>
          {form.type === 'local' ? (
            <label>
              Comando
              <input
                value={form.command}
                placeholder="npx -y @modelcontextprotocol/server-github"
                onChange={(event) => setForm({ ...form, command: event.target.value })}
              />
            </label>
          ) : (
            <label>
              Endereço
              <input
                value={form.url}
                placeholder="https://exemplo.com/mcp"
                onChange={(event) => setForm({ ...form, url: event.target.value })}
              />
            </label>
          )}
          {formError && <p className="dock-app-error">{formError}</p>}
          <div className="dock-app-actions">
            <button type="button" onClick={() => setAdding(false)}>
              Cancelar
            </button>
            <button type="submit" className="is-primary" disabled={busy}>
              Salvar servidor
            </button>
          </div>
        </form>
      )}
      {extensions.mcp.length ? (
        <ul className="dock-app-list">
          {extensions.mcp.map((server) => (
            <li key={server.name}>
              <div>
                <strong>{server.name}</strong>
                <small title={server.target}>{server.target}</small>
              </div>
              <label className="dock-app-switch" title={server.enabled ? 'Ativo' : 'Desativado'}>
                <input
                  type="checkbox"
                  checked={server.enabled}
                  aria-label={`Ativar ${server.name}`}
                  onChange={(event) =>
                    void api
                      ?.toggleMcpServer({ name: server.name, enabled: event.target.checked })
                      .then(applySnapshot)
                  }
                />
                <span aria-hidden="true" />
              </label>
              <button
                type="button"
                className="dock-app-remove"
                aria-label={`Remover ${server.name}`}
                onClick={() => void api?.removeMcpServer(server.name).then(applySnapshot)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !adding && (
          <p className="dock-settings-hint">
            Conecte ferramentas externas, como GitHub, bancos de dados ou documentação, ao agente.
          </p>
        )
      )}

      <div className="dock-settings-section-heading">
        <h3>
          Skills <span>{extensions.skills.length || ''}</span>
        </h3>
        <button type="button" onClick={() => void api?.openSkillsFolder()}>
          Abrir pasta
        </button>
      </div>
      {extensions.skills.length > 0 && (
        <ul className="dock-app-list">
          {extensions.skills.map((skill) => (
            <li key={skill.folder}>
              <div>
                <strong>{skill.name}</strong>
                <small title={skill.description}>{skill.description || skill.folder}</small>
              </div>
              <button
                type="button"
                className="dock-app-remove"
                aria-label={`Remover ${skill.name}`}
                onClick={() => void api?.removeSkill(skill.folder).then(applySnapshot)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="dock-app-wide"
        onClick={() =>
          void api?.importSkill().then((result) => {
            if (applySnapshot(result)) setNotice('Skill adicionada.');
            else if ('error' in result && result.error) setNotice(result.error);
          })
        }
      >
        Importar pasta com SKILL.md
      </button>

      <div className="dock-settings-section-heading">
        <h3>Permissões salvas</h3>
      </div>
      {rules.length ? (
        <ul className="dock-app-list">
          {rules.flatMap((project) =>
            project.rules.map((rule, index) => (
              <li key={`${project.key}-${index}`}>
                <div>
                  <strong>
                    {project.label} · {PERMISSION_NAMES[rule.permission] || rule.permission}
                  </strong>
                  <small title={rule.patterns.join(', ')}>{rule.patterns.join(', ')}</small>
                </div>
                <button
                  type="button"
                  className="dock-app-remove"
                  aria-label={`Remover regra de ${project.label}`}
                  onClick={() =>
                    void api
                      ?.removePermissionRule({ key: project.key, index })
                      .then(() => api.listPermissionRules())
                      .then(setRules)
                  }
                >
                  ×
                </button>
              </li>
            )),
          )}
        </ul>
      ) : (
        <p className="dock-settings-hint">
          Nenhuma regra ainda. Ao aprovar uma ação, escolha “Sempre neste projeto”.
        </p>
      )}

      <div className="dock-settings-section-heading">
        <h3>Diagnóstico</h3>
      </div>
      <div className="dock-app-actions is-spread">
        <button
          type="button"
          onClick={() =>
            void api?.copyDiagnostics().then(() => setNotice('Diagnóstico copiado, sem senhas.'))
          }
        >
          Copiar diagnóstico
        </button>
        <button type="button" onClick={() => void api?.openLogs()}>
          Abrir logs
        </button>
        <button type="button" onClick={() => void api?.reportIssue()}>
          Relatar problema
        </button>
      </div>
      <p className="dock-settings-hint">
        Os logs ficam só neste computador. Nada é enviado sem você colar.
      </p>
      {notice && (
        <p className="dock-app-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
