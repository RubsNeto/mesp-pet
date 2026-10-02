import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTO_ROUTER_MODEL } from '../../electron/dockRouter.mjs';
import type {
  RouterOverview,
  RouterCounters,
  RouterQuota,
  RouterAccount,
} from '../../electron/dockRouter.mjs';
import { DockRouterPanel } from './DockRouterPanel';
import { DockConnectionIcon as ConnectionIcon } from './DockConnectionIcon';
import { DockModelPicker, dockModelLabel } from './DockModelPicker';

const format = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
const date = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});
const PROVIDERS = [
  { id: 'codex', name: 'Codex' },
  { id: 'claude', name: 'Claude Code' },
  { id: 'gemini-cli', name: 'Gemini' },
] as const;

function resetLabel(resetAt: number | null) {
  if (!resetAt) return 'Reset não informado';
  const minutes = Math.ceil((resetAt - Date.now()) / 60000);
  if (minutes <= 0) return 'Aguardando atualização do reset';
  if (minutes < 60) return `Reset em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? `Reset em ${hours}h ${minutes % 60}min`
    : `Reset em ${Math.floor(hours / 24)}d ${hours % 24}h`;
}
function quotaName(key: string) {
  return key
    .replace(/session/g, 'Sessão')
    .replace(/weekly/g, 'Semana')
    .replace(/monthly/g, 'Mês')
    .replace(/daily/g, 'Dia')
    .replace(/review/g, 'Revisão');
}
function Quota({ quota, account }: { quota: RouterQuota; account: string }) {
  return (
    <div className="dock-quota">
      <div>
        <span>{quotaName(quota.key)}</span>
        <strong>
          {quota.unlimited
            ? 'Sem limite'
            : quota.usedPercent === null
              ? 'Cota informada'
              : `${Math.round(quota.usedPercent)}% usado`}
        </strong>
      </div>
      {!quota.unlimited && quota.usedPercent !== null && (
        <progress
          aria-label={`${account} · ${quotaName(quota.key)}`}
          max="100"
          value={quota.usedPercent}
        />
      )}
      <small title={quota.resetAt ? date.format(quota.resetAt) : undefined}>
        {resetLabel(quota.resetAt)}
      </small>
    </div>
  );
}
function Consumption({ value }: { value: RouterCounters | null }) {
  return (
    <div className="dock-consumption" aria-label="Consumo no período">
      <div>
        <small>Pedidos</small>
        <strong>{value ? format.format(value.requests) : '—'}</strong>
      </div>
      <div>
        <small>Tokens</small>
        <strong
          title={
            value
              ? `${value.inputTokens.toLocaleString('pt-BR')} entrada · ${value.outputTokens.toLocaleString('pt-BR')} saída · ${value.cachedTokens.toLocaleString('pt-BR')} cache`
              : undefined
          }
        >
          {value ? format.format(value.tokens) : '—'}
        </strong>
      </div>
      <div>
        <small>Custo estimado</small>
        <strong>{value?.cost == null ? '—' : currency.format(value.cost)}</strong>
      </div>
    </div>
  );
}

type SettingsTab = 'models' | 'accounts' | 'usage';
const cachedOverviews = new Map<string, RouterOverview>();
function accountState(account: RouterAccount, nextId?: string) {
  if (account.health === 'disabled') return 'Desativada';
  if (account.health === 'unknown') return 'Não verificada';
  if (account.health === 'auth' || account.health === 'error') return 'Reconectar';
  if (account.lastFailure === 'permission') return 'Verificar acesso';
  if (account.limitReached) return 'Sem cota';
  return account.id === nextId ? 'Prioridade Auto' : 'Ativa';
}

export function DockSettings({
  project,
  currentModel,
  canChange,
  onApply,
  active,
  requestedPage,
  onPanelOpenChange,
}: {
  project: string;
  currentModel?: string;
  canChange: boolean;
  onApply: (model: string) => void;
  active: boolean;
  requestedPage?: { page: string; nonce: number };
  onPanelOpenChange: (open: boolean) => void;
}) {
  const [overview, setOverview] = useState<RouterOverview | null>(
    () => cachedOverviews.get('today') || null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<SettingsTab>(
    requestedPage?.page === 'overview' ? 'models' : 'accounts',
  );
  const [panelPage, setPanelPage] = useState('');
  const [panelRequest, setPanelRequest] = useState(0);
  const [period, setPeriod] = useState('today');
  const [accountId, setAccountId] = useState('all');
  const [error, setError] = useState('');
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [tab]);
  const mounted = useRef(true),
    refreshingRef = useRef(false),
    periodRef = useRef(period),
    activeRef = useRef(active);
  periodRef.current = period;
  activeRef.current = active;
  const refresh = useCallback(async function update(force = false) {
    if (refreshingRef.current || !window.mesp) return;
    refreshingRef.current = true;
    setRefreshing(true);
    const requestedPeriod = periodRef.current;
    try {
      // Keep the project's private OpenCode catalogue synchronized as well as the UI summary.
      // The initial refresh bypasses an empty startup cache; later refreshes use its cache.
      const [data] = await Promise.all([
        window.mesp.get9RouterOverview(requestedPeriod, force),
        window.mesp.getOpenCodeStatus(force || !cachedOverviews.has(requestedPeriod)),
      ]);
      cachedOverviews.set(requestedPeriod, data);
      if (!mounted.current || requestedPeriod !== periodRef.current) return;
      setOverview(data);
      setAccountId((previous) =>
        previous === 'all' || data.accounts.some((account) => account.id === previous)
          ? previous
          : 'all',
      );
      setError('');
    } catch {
      if (mounted.current) setError('Não foi possível atualizar as contas. Tente novamente.');
    } finally {
      refreshingRef.current = false;
      if (mounted.current) setRefreshing(false);
      if (mounted.current && activeRef.current && requestedPeriod !== periodRef.current)
        void update();
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.mesp?.on9RouterClosed(() => void refresh(true));
    return () => {
      mounted.current = false;
      unsubscribe?.();
    };
  }, [refresh]);
  useEffect(() => {
    if (!active) return;
    const cached = cachedOverviews.get(period);
    if (cached) setOverview(cached);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [active, period, refresh]);
  useEffect(() => {
    if (!requestedPage) return;
    if (requestedPage.page === 'overview' || requestedPage.page === 'connections') {
      setPanelPage('');
      setTab(requestedPage.page === 'overview' ? 'models' : 'accounts');
    } else setPanelPage(requestedPage.page);
    setPanelRequest((value) => value + 1);
  }, [requestedPage]);
  useEffect(() => {
    onPanelOpenChange(!!panelPage);
    return () => onPanelOpenChange(false);
  }, [panelPage, onPanelOpenChange]);
  const open = (page: string) => {
    setError('');
    setPanelPage(page);
    setPanelRequest((value) => value + 1);
  };
  const accounts = overview?.accounts || [];
  const models = overview?.models || [];
  const selectedInfo = models.find((model) => model.id === currentModel);
  const modelName =
    currentModel === AUTO_ROUTER_MODEL
      ? 'Auto'
      : dockModelLabel(selectedInfo?.name || currentModel || 'Escolher modelo');
  const visibleAccounts = accounts.filter(
    (account) => accountId === 'all' || account.id === accountId,
  );
  const consumption =
    overview?.period !== period
      ? null
      : accountId === 'all'
        ? overview?.totals || null
        : accounts.find((account) => account.id === accountId)?.consumption || null;
  const changeTab = (next: SettingsTab) => setTab(next);
  return (
    <div
      className={`dock-settings${panelPage ? ' is-router' : ''}`}
      role="tabpanel"
      id="dock-settings-panel"
      aria-labelledby="dock-settings-tab"
    >
      {panelPage ? (
        <DockRouterPanel
          page={panelPage}
          request={panelRequest}
          active={active}
          onNavigate={open}
          onClose={() => {
            setPanelPage('');
            void refresh(true);
          }}
        />
      ) : (
        <>
          <div className={`dock-settings-heading${tab === 'models' ? ' is-model-heading' : ''}`}>
            <div>
              <h2>
                {tab === 'models'
                  ? 'Escolha seu modelo'
                  : tab === 'accounts'
                    ? 'Suas conexões'
                    : 'Consumo e limites'}
              </h2>
              <p title={project}>
                {tab === 'models'
                  ? `Um clique para usar em ${project}.`
                  : tab === 'accounts'
                    ? 'Suas contas, juntas no MESP.'
                    : 'Acompanhe o uso geral ou de uma conta.'}
              </p>
            </div>
            <button
              className="dock-settings-refresh"
              onClick={() => void refresh(true)}
              disabled={refreshing}
              aria-label="Atualizar conexões"
              title="Atualizar contas e modelos"
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
          <div
            className="dock-settings-tabs"
            role="tablist"
            aria-label="Ajustes do MESP"
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const tabs = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
              ];
              const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              tabs[next].click();
              tabs[next].focus();
            }}
          >
            {(
              [
                ['models', 'Modelos'],
                ['accounts', 'Contas'],
                ['usage', 'Consumo'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                id={`dock-settings-${id}`}
                role="tab"
                aria-selected={tab === id}
                aria-controls={`dock-settings-content-${id}`}
                onClick={() => changeTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {error && (
            <div className="dock-settings-error" role="alert">
              {error}
            </div>
          )}
          <div
            className="dock-settings-body"
            ref={body}
            id={`dock-settings-content-${tab}`}
            role="tabpanel"
            aria-labelledby={`dock-settings-${tab}`}
          >
            {tab === 'models' && (
              <>
                <div className="dock-current-model">
                  <span>Em uso neste MESP</span>
                  <strong title={currentModel}>{modelName}</strong>
                  <button
                    className="dock-settings-inline-refresh"
                    aria-label="Atualizar conexões"
                    disabled={refreshing}
                    onClick={() => void refresh(true)}
                    title="Atualizar contas e modelos"
                  >
                    ↻
                  </button>
                </div>
                <DockModelPicker
                  overview={overview}
                  currentModel={currentModel}
                  canChange={canChange}
                  loading={refreshing}
                  active={active}
                  onChoose={onApply}
                  onConnect={() => changeTab('accounts')}
                />
              </>
            )}
            {tab === 'accounts' && (
              <>
                <button className="dock-model-shortcut" onClick={() => changeTab('models')}>
                  <span className="dock-choice-icon">
                    <ConnectionIcon
                      provider={
                        currentModel === AUTO_ROUTER_MODEL
                          ? 'auto'
                          : selectedInfo?.provider || 'other'
                      }
                    />
                  </span>
                  <span className="dock-choice-copy">
                    <small>Modelo deste MESP</small>
                    <strong>{modelName}</strong>
                  </span>
                  <span>Trocar ›</span>
                </button>
                <div className="dock-settings-section-heading">
                  <h3>Conectar uma conta</h3>
                  <small>Escolha o provedor</small>
                </div>
                <nav className="dock-connect-buttons" aria-label="Conectar provedores">
                  {PROVIDERS.map((provider) => {
                    const action = `${accounts.some((account) => account.provider === provider.id) ? 'Gerenciar' : 'Conectar'} ${provider.name}`;
                    return (
                      <button
                        key={provider.id}
                        onClick={() => open(provider.id)}
                        aria-label={action}
                        title={action}
                      >
                        <ConnectionIcon provider={provider.id} />
                        <span>{provider.name}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => open('providers')}
                    aria-label="Outros provedores"
                    title="Todas as conexões disponíveis"
                  >
                    <ConnectionIcon provider="other" />
                    <span>Outros</span>
                  </button>
                </nav>
                <div className="dock-settings-section-heading">
                  <h3>
                    Suas contas <span>{accounts.length}</span>
                  </h3>
                  <button onClick={() => open('providers')}>Gerenciar contas</button>
                </div>
                {refreshing && !overview && (
                  <p className="dock-settings-hint" role="status">
                    Consultando suas contas…
                  </p>
                )}
                <div className="dock-connections-list">
                  {accounts.map((account) => {
                    const resets = account.quotas
                      .map((quota) => quota.resetAt)
                      .filter((reset): reset is number => reset !== null)
                      .sort((a, b) => a - b);
                    const state = accountState(account, overview?.auto.next?.accountId);
                    return (
                      <article
                        className="dock-connection-card"
                        key={account.id}
                        data-account-id={account.id}
                      >
                        <div className="dock-connection-identity">
                          <span className="dock-choice-icon">
                            <ConnectionIcon provider={account.provider} />
                          </span>
                          <div>
                            <strong title={account.label}>{account.label}</strong>
                            <small>
                              {account.providerName}
                              {account.plan ? ` · ${account.plan}` : ''}
                            </small>
                          </div>
                          <span className="dock-account-state">{state}</span>
                        </div>
                        <div className="dock-connection-detail">
                          <span>
                            {account.quotas.length
                              ? resetLabel(resets[0] || null)
                              : account.quotaState === 'unsupported'
                                ? 'Reset não informado pelo provedor'
                                : 'Cota ainda não consultada'}
                          </span>
                          <button
                            aria-label={`Gerenciar ${account.label}`}
                            onClick={() =>
                              open(
                                PROVIDERS.some((provider) => provider.id === account.provider)
                                  ? account.provider
                                  : 'providers',
                              )
                            }
                          >
                            Gerenciar ›
                          </button>
                        </div>
                        <button
                          className="dock-account-usage-link"
                          onClick={() => {
                            setAccountId(account.id);
                            changeTab('usage');
                          }}
                        >
                          {account.consumption
                            ? `${format.format(account.consumption.tokens)} tokens · ${format.format(account.consumption.requests)} pedidos`
                            : 'Ver consumo e limites'}{' '}
                          <span aria-hidden="true">↗</span>
                        </button>
                      </article>
                    );
                  })}
                </div>
                {overview && !accounts.length && (
                  <div className="dock-settings-empty">
                    <strong>Seu primeiro modelo começa aqui</strong>
                    <p>
                      Conecte uma conta acima. Depois, escolha qualquer modelo dela na aba Modelos.
                    </p>
                  </div>
                )}
              </>
            )}
            {tab === 'usage' && (
              <section className="dock-usage-section">
                <div className="dock-usage-filters">
                  <label>
                    Conta
                    <select
                      aria-label="Conta do consumo"
                      value={accountId}
                      onChange={(event) => setAccountId(event.target.value)}
                    >
                      <option value="all">Todas as contas</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.label} · {account.providerName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Período
                    <select
                      aria-label="Período do consumo"
                      value={period}
                      onChange={(event) => setPeriod(event.target.value)}
                    >
                      <option value="today">Hoje</option>
                      <option value="7d">7 dias</option>
                      <option value="30d">30 dias</option>
                      <option value="all">Todo o histórico</option>
                    </select>
                  </label>
                </div>
                <Consumption value={consumption} />
                <p className="dock-usage-note">
                  Consumo registrado pelo 9Router. Custos são estimativas.
                </p>
                {overview && !overview.usageAvailable && (
                  <p className="dock-settings-hint">
                    Histórico de consumo temporariamente indisponível.
                  </p>
                )}
                <div className="dock-settings-section-heading">
                  <h3>Cotas e resets</h3>
                  <button onClick={() => open('usage')}>Histórico completo ↗</button>
                </div>
                <div className="dock-account-list">
                  {visibleAccounts.map((account) => (
                    <article
                      className="dock-account-card"
                      key={account.id}
                      data-account-id={account.id}
                    >
                      <div className="dock-account-heading">
                        <div>
                          <strong>{account.label}</strong>
                          <small>{account.providerName}</small>
                        </div>
                        <span>{accountState(account, overview?.auto.next?.accountId)}</span>
                      </div>
                      {account.quotas.length ? (
                        <div className="dock-account-quotas">
                          {account.quotas.map((quota) => (
                            <Quota key={quota.key} quota={quota} account={account.label} />
                          ))}
                        </div>
                      ) : (
                        <p className="dock-settings-hint">
                          {account.health === 'auth' || account.health === 'error'
                            ? 'Reconecte esta conta para atualizar os dados.'
                            : account.quotaState === 'unsupported'
                              ? 'Este provedor não informa cota ou reset.'
                              : 'Cota indisponível no momento.'}
                        </p>
                      )}
                      {account.lastFailure === 'permission' && (
                        <p className="dock-settings-hint">
                          O provedor recusou o último pedido. Revise o acesso ou escolha outro
                          modelo.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
          <div className="dock-settings-bottom">
            <span role="status">
              {refreshing
                ? 'Atualizando…'
                : overview
                  ? `${models.length} modelos · ${accounts.length} conta${accounts.length === 1 ? '' : 's'}`
                  : '9Router · aguardando conexão'}
            </span>
            <button onClick={() => open('cli-tools')}>Configurar ferramentas</button>
          </div>
        </>
      )}
    </div>
  );
}
