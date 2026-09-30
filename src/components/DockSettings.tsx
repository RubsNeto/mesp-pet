import { useCallback, useEffect, useRef, useState } from 'react';
import type { MespCodeStatus } from './MespCodeChat';
import type { RouterConnectionSummary } from '../../electron/dockRouter.mjs';

const PROVIDERS = [
  { id: 'codex', name: 'Codex', subtitle: 'OpenAI · conta ChatGPT', mark: 'code' },
  { id: 'claude', name: 'Claude Code', subtitle: 'Anthropic · conta Claude', mark: 'spark' },
  { id: 'gemini-cli', name: 'Gemini', subtitle: 'Google · conta Gemini', mark: 'diamond' },
] as const;

function ConnectionIcon({ mark }: { mark: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          mark === 'code'
            ? 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16'
            : mark === 'spark'
              ? 'M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6'
              : 'm12 3 9 9-9 9-9-9 9-9Z'
        }
      />
    </svg>
  );
}

export function DockSettings({
  project,
  currentModel,
  canChange,
  onApply,
}: {
  project: string;
  currentModel?: string;
  canChange: boolean;
  onApply: (model: string) => void;
}) {
  const [status, setStatus] = useState<MespCodeStatus | null>(null);
  const [connections, setConnections] = useState<RouterConnectionSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState('');
  const [model, setModel] = useState(currentModel || '');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const refreshingRef = useRef(false);
  const refresh = useCallback(async (force = false) => {
    if (refreshingRef.current || !window.mesp) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setError('');
    try {
      const [next, accounts] = await Promise.all([
        window.mesp.getOpenCodeStatus(force),
        window.mesp.get9RouterConnections(),
      ]);
      if (!mounted.current) return;
      setStatus(next);
      setConnections(accounts);
      setModel((previous) =>
        next.models.includes(previous)
          ? previous
          : next.model && next.models.includes(next.model)
            ? next.model
            : next.models[0] || '',
      );
    } catch {
      if (mounted.current) setError('Não foi possível consultar as conexões. Tente atualizar.');
    } finally {
      refreshingRef.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const unsubscribe = window.mesp?.on9RouterClosed(() => void refresh(true));
    return () => {
      mounted.current = false;
      unsubscribe?.();
    };
  }, [refresh]);
  const open = async (page: 'codex' | 'claude' | 'gemini-cli' | 'providers' | 'cli-tools') => {
    if (opening || !window.mesp) return;
    setOpening(page);
    setError('');
    try {
      const result = await window.mesp.open9RouterDashboard(page);
      if (!result.ok && mounted.current)
        setError(result.error || 'Não foi possível abrir o 9Router.');
    } catch {
      if (mounted.current) setError('Não foi possível abrir o 9Router.');
    } finally {
      if (mounted.current) setOpening('');
    }
  };
  const ready = status?.routerState === 'ready';
  return (
    <div
      className="dock-settings"
      role="tabpanel"
      id="dock-settings-panel"
      aria-labelledby="dock-settings-tab"
    >
      <div className="dock-settings-heading">
        <div>
          <h2>Conexões de IA</h2>
          <p>Suas contas e modelos, reunidos pelo 9Router.</p>
        </div>
        <button
          className="dock-settings-refresh"
          onClick={() => void refresh(true)}
          disabled={refreshing}
          aria-label="Atualizar conexões"
        >
          <svg
            className={refreshing ? 'spinning' : ''}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3" />
          </svg>
        </button>
      </div>
      <div className="dock-router-health" role="status">
        <span
          className={`dock-status ${ready ? 'state-success' : refreshing ? 'state-thinking' : 'state-waiting'}`}
        />
        <strong>9Router</strong>
        <span>
          {refreshing
            ? 'Buscando conexões…'
            : ready
              ? `${status.modelCount} modelos disponíveis`
              : status?.routerState === 'misconfigured'
                ? 'Conecte sua primeira conta'
                : 'Precisa de configuração'}
        </span>
        <button onClick={() => void open('providers')} disabled={Boolean(opening)}>
          Abrir painel ↗
        </button>
      </div>
      <div className="dock-provider-list">
        {PROVIDERS.map((provider) => {
          const account = connections?.find((item) => item.provider === provider.id);
          return (
            <div className="dock-provider" key={provider.id}>
              <span className="dock-provider-icon">
                <ConnectionIcon mark={provider.mark} />
              </span>
              <div className="dock-provider-copy">
                <strong>{provider.name}</strong>
                <small>{provider.subtitle}</small>
              </div>
              <span className={`dock-provider-state ${account?.active ? 'connected' : ''}`}>
                {account?.active
                  ? `${account.active} conta${account.active === 1 ? '' : 's'} ativa${account.active === 1 ? '' : 's'}`
                  : connections === null
                    ? 'Não verificado'
                    : 'Não conectado'}
              </span>
              <button onClick={() => void open(provider.id)} disabled={Boolean(opening)}>
                {opening === provider.id
                  ? 'Abrindo…'
                  : account?.accounts
                    ? 'Gerenciar'
                    : 'Conectar'}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          );
        })}
        <button
          className="dock-settings-other"
          onClick={() => void open('providers')}
          disabled={Boolean(opening)}
        >
          Outros provedores{' '}
          <span>
            Copilot, Cursor e mais <span aria-hidden="true">↗</span>
          </span>
        </button>
      </div>
      <section className="dock-settings-model">
        <div>
          <h3>Modelo deste MESP</h3>
          <p>{project} · pedidos enviados pelo 9Router</p>
        </div>
        <div className="dock-settings-model-controls">
          <select
            aria-label="Modelo deste MESP"
            value={model}
            disabled={!ready || refreshing || !canChange}
            onChange={(e) => setModel(e.target.value)}
          >
            {!status?.models.length && <option value="">Conecte uma conta para escolher</option>}
            {status?.models.map((id) => (
              <option value={id} key={id}>
                {id.replace(/^9router\//, '')}
              </option>
            ))}
          </select>
          <button
            className="dock-settings-apply"
            onClick={() => onApply(model)}
            disabled={!ready || !model || !canChange}
          >
            Usar neste MESP
          </button>
        </div>
        {!canChange && (
          <small className="dock-settings-hint">
            Você poderá trocar o modelo quando a tarefa atual terminar.
          </small>
        )}
      </section>
      <div className="dock-settings-bottom">
        <span>O login é feito no painel do 9Router.</span>
        <button onClick={() => void open('cli-tools')} disabled={Boolean(opening)}>
          Configurar ferramentas ↗
        </button>
      </div>
      {error && (
        <div className="dock-settings-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
