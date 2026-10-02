import { useCallback, useEffect, useRef, useState } from 'react';
import type { MespCodeStatus } from './MespCodeChat';
import { AUTO_ROUTER_MODEL } from '../../electron/dockRouter.mjs';
import type { RouterOverview, RouterCounters, RouterQuota } from '../../electron/dockRouter.mjs';
import { DockRouterPanel } from './DockRouterPanel';

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
function ConnectionIcon({ provider }: { provider: string }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {provider === 'codex' ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="4" />
          <path d="m7 9 3 3-3 3m6 0h4" />
        </>
      ) : provider === 'claude' ? (
        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" />
      ) : provider === 'gemini-cli' ? (
        <path d="M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z" />
      ) : (
        <>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </>
      )}
    </svg>
  );
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
  const [status, setStatus] = useState<MespCodeStatus | null>(null);
  const [overview, setOverview] = useState<RouterOverview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [panelPage, setPanelPage] = useState('');
  const [panelRequest, setPanelRequest] = useState(0);
  const [model, setModel] = useState(currentModel || '');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('today');
  const [accountId, setAccountId] = useState('all');
  const [error, setError] = useState('');
  const mounted = useRef(true),
    refreshingRef = useRef(false);
  const periodRef = useRef(period);
  periodRef.current = period;
  const refresh = useCallback(async function update(force = false) {
    if (refreshingRef.current || !window.mesp) return;
    refreshingRef.current = true;
    setRefreshing(true);
    const requestedPeriod = periodRef.current;
    try {
      const [next, data] = await Promise.all([
        window.mesp.getOpenCodeStatus(force),
        window.mesp.get9RouterOverview(requestedPeriod, force),
      ]);
      if (!mounted.current || requestedPeriod !== periodRef.current) return;
      setStatus(next);
      setOverview(data);
      setError('');
      const choices = data.models.map((item) => item.id);
      if (data.auto.supported && choices.length) choices.unshift(AUTO_ROUTER_MODEL);
      setModel((previous) =>
        choices.includes(previous)
          ? previous
          : choices.includes(next.model || '')
            ? next.model!
            : choices[0] || '',
      );
    } catch {
      if (mounted.current)
        setError('Não foi possível atualizar contas e consumo. Tente novamente.');
    } finally {
      refreshingRef.current = false;
      if (mounted.current) setRefreshing(false);
      if (mounted.current && requestedPeriod !== periodRef.current) void update();
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
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [active, refresh]);
  useEffect(() => {
    void refresh();
  }, [period, refresh]);
  useEffect(() => {
    if (requestedPage) {
      setPanelPage(requestedPage.page === 'overview' ? '' : requestedPage.page);
      setPanelRequest((value) => value + 1);
    }
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
  const ready = status?.routerState === 'ready';
  const verified = overview?.accounts.filter((item) => item.health === 'active').length || 0;
  const models = overview?.models || [];
  const filtered = models.filter((item) =>
    `${item.name} ${item.id} ${item.providerName}`.toLowerCase().includes(query.toLowerCase()),
  );
  const groups = Array.from(new Set(filtered.map((item) => item.providerName)));
  const visibleAccounts = (overview?.accounts || []).filter(
    (item) => accountId === 'all' || item.id === accountId,
  );
  const consumption =
    accountId === 'all'
      ? overview?.totals || null
      : overview?.accounts.find((item) => item.id === accountId)?.consumption || null;
  const selectedInfo = models.find((item) => item.id === model);
  return (
    <div
      className={`dock-settings${panelPage ? ' is-router' : ''}`}
      role="tabpanel"
      id="dock-settings-panel"
      aria-labelledby="dock-settings-tab"
      aria-busy={refreshing}
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
          <div className="dock-settings-heading">
            <div>
              <h2>Conexões</h2>
              <p>Conecte suas contas e escolha a IA deste MESP.</p>
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
          <nav className="dock-connect-buttons" aria-label="Conectar provedores">
            {PROVIDERS.map((provider) => {
              const connected = overview?.accounts.some((item) => item.provider === provider.id);
              const action = `${connected ? 'Gerenciar' : 'Conectar'} ${provider.name}`;
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
              <span>Todos</span>
            </button>
          </nav>
          <div className="dock-router-health" role="status">
            <span className={`dock-status ${ready ? 'state-success' : 'state-waiting'}`} />
            <strong>9Router</strong>
            <span>
              {refreshing && !overview
                ? 'Consultando contas…'
                : overview
                  ? `${models.length} modelos · ${verified} conta${verified === 1 ? '' : 's'} com dados`
                  : 'Não verificado'}
            </span>
            <button onClick={() => open('providers')}>Gerenciar contas</button>
          </div>
          {overview?.accountSource === '9router' && (
            <p className="dock-usage-note">
              Contas e histórico sincronizados com seu 9Router existente.
            </p>
          )}
          <section className="dock-settings-model">
            <h3>Modelo deste MESP</h3>
            <p>{project}</p>
            <input
              className="dock-model-search"
              type="search"
              aria-label="Buscar modelos"
              placeholder="Buscar entre todos os provedores"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="dock-settings-model-controls">
              <select
                aria-label="Modelo deste MESP"
                value={model}
                disabled={!ready || !canChange || refreshing}
                onChange={(event) => setModel(event.target.value)}
              >
                {!models.length && <option value="">Conecte uma conta para escolher</option>}
                {overview?.auto.supported && models.length > 0 && (
                  <option value={AUTO_ROUTER_MODEL}>Auto · priorizar o próximo reset</option>
                )}
                {selectedInfo && !filtered.includes(selectedInfo) && (
                  <option value={selectedInfo.id}>{selectedInfo.name}</option>
                )}
                {groups.map((group) => (
                  <optgroup key={group} label={group}>
                    {filtered
                      .filter((item) => item.providerName === group)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.accountIds.length} conta
                          {item.accountIds.length === 1 ? '' : 's'}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <button
                className="dock-settings-apply"
                onClick={() => onApply(model)}
                disabled={!ready || !model || !canChange || refreshing}
              >
                Usar neste MESP
              </button>
            </div>
            {model === AUTO_ROUTER_MODEL ? (
              <div className="dock-auto-explanation">
                <strong>Use a cota antes que ela renove</strong>
                <p>
                  Escolhe modelo e conta a cada pedido. Prioriza o reset mais próximo e pula contas
                  sem cota.
                </p>
                <small>
                  {overview?.auto.next
                    ? `${overview.auto.next.accountLabel} · ${overview.auto.next.model.replace(/^9router\//, '')} · ${resetLabel(overview.auto.next.resetAt)}`
                    : 'Aguardando uma conta disponível.'}
                </small>
              </div>
            ) : (
              selectedInfo && (
                <small className="dock-settings-hint">
                  {selectedInfo.providerName} ·{' '}
                  {selectedInfo.source === 'live'
                    ? 'Modelos consultados na conta'
                    : 'Catálogo do 9Router; disponibilidade confirmada ao usar'}
                </small>
              )
            )}
            {!canChange && (
              <small className="dock-settings-hint">
                Você poderá trocar o modelo quando a tarefa atual terminar.
              </small>
            )}
            {overview && !overview.auto.supported && models.length > 0 && (
              <small className="dock-settings-hint">Auto requer o 9Router integrado do MESP.</small>
            )}
          </section>
          <section className="dock-usage-section">
            <div className="dock-usage-heading">
              <h3>Consumo</h3>
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
            </div>
            <select
              className="dock-account-filter"
              aria-label="Conta do consumo"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="all">Geral · todas as contas</option>
              {overview?.accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · {item.providerName}
                </option>
              ))}
            </select>
            <Consumption value={consumption} />
            <p className="dock-usage-note">
              Pedidos registrados pelo 9Router. As cotas abaixo vêm dos provedores.
            </p>
            {overview && !overview.usageAvailable && (
              <p className="dock-settings-hint">
                Histórico de consumo temporariamente indisponível.
              </p>
            )}
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
                      <small>
                        {account.providerName}
                        {account.plan ? ` · ${account.plan}` : ''}
                      </small>
                    </div>
                    <span>
                      {account.health === 'disabled'
                        ? 'Desativada'
                        : account.health === 'unknown'
                          ? 'Não verificada'
                          : account.health === 'auth' || account.health === 'error'
                            ? 'Reconectar'
                            : account.lastFailure === 'permission'
                              ? 'Verificar acesso'
                              : account.limitReached
                                ? 'Sem cota'
                                : overview?.auto.next?.accountId === account.id
                                  ? 'Prioridade Auto'
                                  : 'Ativa'}
                    </span>
                  </div>
                  {account.quotas.length > 0 ? (
                    <div className="dock-account-quotas">
                      {account.quotas.map((quota) => (
                        <Quota key={quota.key} quota={quota} account={account.label} />
                      ))}
                    </div>
                  ) : (
                    <p className="dock-settings-hint">
                      {account.health === 'auth' || account.health === 'error'
                        ? 'Reconecte esta conta no painel para atualizar modelos e cotas.'
                        : account.quotaState === 'unsupported'
                          ? 'Este provedor não informa cota ou reset.'
                          : account.active
                            ? 'Não foi possível consultar a cota agora.'
                            : 'Conecte esta conta para consultar a cota.'}
                    </p>
                  )}
                  <div className="dock-account-spend">
                    {account.consumption
                      ? `${format.format(account.consumption.tokens)} tokens · ${format.format(account.consumption.requests)} pedidos · ${account.consumption.cost == null ? 'Custo indisponível' : currency.format(account.consumption.cost)}`
                      : 'Consumo indisponível'}
                    <button
                      onClick={() => void open('providers')}
                      aria-label={`Gerenciar ${account.label}`}
                    >
                      Gerenciar
                    </button>
                  </div>
                  {account.lastFailure === 'permission' && (
                    <p className="dock-settings-hint">
                      O provedor recusou o último pedido com HTTP 403. Revise o acesso desta conta
                      ou escolha outro modelo.
                    </p>
                  )}
                </article>
              ))}
              {overview && !overview.accounts.length && (
                <div className="dock-accounts-empty">
                  <strong>Conecte sua primeira conta</strong>
                  <p>Seus modelos, cotas e resets aparecerão aqui.</p>
                </div>
              )}
            </div>
          </section>
          <div className="dock-settings-bottom">
            <span>
              {overview
                ? `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(overview.updatedAt)}`
                : 'O login é feito no painel do 9Router.'}
            </span>
            <button onClick={() => open('cli-tools')}>Configurar ferramentas</button>
          </div>
          {error && (
            <div className="dock-settings-error" role="alert">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
