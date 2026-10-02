import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AUTO_ROUTER_MODEL, type RouterOverview } from '../../electron/dockRouter.mjs';
import { DockConnectionIcon } from './DockConnectionIcon';

export function dockModelLabel(name: string) {
  return (name.split('/').pop() || name)
    .replace(/^gpt-/i, 'GPT-')
    .replace(/^claude-/i, 'Claude ')
    .replace(/^gemini-/i, 'Gemini ')
    .replace(/_/g, ' ');
}
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function DockModelPicker({
  overview,
  currentModel,
  canChange,
  loading,
  active,
  onChoose,
  onConnect,
}: {
  overview: RouterOverview | null;
  currentModel?: string;
  canChange: boolean;
  loading: boolean;
  active: boolean;
  onChoose: (model: string) => void;
  onConnect: () => void;
}) {
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('all');
  const [focusedModel, setFocusedModel] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const models = overview?.models || [];
  const providers = [
    ...new Map(models.map((model) => [model.provider, model.providerName])).entries(),
  ];
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const filtered = models.filter(
    (model) =>
      (provider === 'all' || provider === model.provider) &&
      words.every((word) =>
        normalize(`${model.name} ${model.id} ${model.providerName}`).includes(word),
      ),
  );
  const autoVisible =
    overview?.auto.supported &&
    models.length > 0 &&
    (!words.length ||
      words.every((word) => normalize('auto automatico reset conta').includes(word)));
  const groups = [...new Set(filtered.map((model) => model.providerName))];
  const selectedInfo = models.find((model) => model.id === currentModel);
  const disabled = !canChange || !overview?.modelsAvailable;
  const visibleIds = [
    ...(autoVisible ? [AUTO_ROUTER_MODEL] : []),
    ...filtered.map((model) => model.id),
  ];
  const tabStop = visibleIds.includes(focusedModel)
    ? focusedModel
    : visibleIds.includes(currentModel || '')
      ? currentModel
      : visibleIds[0];
  useEffect(() => {
    if (active) search.current?.focus();
  }, [active]);
  const choose = (model: string) => {
    if (!disabled) onChoose(model);
  };
  const focusOption = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = [
      ...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ||
        []),
    ];
    if (!options.length) return;
    event.preventDefault();
    event.stopPropagation();
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next].focus();
  };
  return (
    <section className="dock-model-picker" aria-label="Escolher modelo">
      <div className="dock-model-searchbar">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          ref={search}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar modelos"
          placeholder="Buscar modelo ou provedor…"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              list.current
                ?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')
                ?.focus();
            }
            if (event.key === 'Enter' && filtered.length === 1) {
              event.preventDefault();
              choose(filtered[0].id);
            } else if (event.key === 'Enter' && autoVisible && filtered.length === 0) {
              event.preventDefault();
              choose(AUTO_ROUTER_MODEL);
            }
          }}
        />
      </div>
      {providers.length > 1 && (
        <div className="dock-model-filters" role="group" aria-label="Filtrar modelos por provedor">
          <button
            type="button"
            aria-pressed={provider === 'all'}
            onClick={() => setProvider('all')}
          >
            Todos
          </button>
          {providers.map(([id, name]) => (
            <button
              type="button"
              key={id}
              aria-pressed={provider === id}
              onClick={() => setProvider(id)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="dock-model-result-caption">
        <span role="status">
          {loading && !overview
            ? 'Buscando seus modelos…'
            : `${filtered.length} modelo${filtered.length === 1 ? '' : 's'}`}
        </span>
        <small>{canChange ? 'Clique para usar' : 'Tarefa em andamento'}</small>
      </div>
      {!canChange && (
        <p className="dock-settings-hint">
          Você pode consultar os modelos. Pare ou conclua a tarefa para trocar.
        </p>
      )}
      {currentModel && currentModel !== AUTO_ROUTER_MODEL && overview && !selectedInfo && (
        <p className="dock-settings-hint">
          O modelo salvo não está disponível agora. Escolha outro ou atualize as contas.
        </p>
      )}
      <div
        className="dock-model-list"
        role="listbox"
        aria-label="Modelos disponíveis"
        ref={list}
        onKeyDown={focusOption}
      >
        {autoVisible && (
          <button
            type="button"
            role="option"
            aria-selected={currentModel === AUTO_ROUTER_MODEL}
            data-model={AUTO_ROUTER_MODEL}
            tabIndex={tabStop === AUTO_ROUTER_MODEL ? 0 : -1}
            onFocus={() => setFocusedModel(AUTO_ROUTER_MODEL)}
            className="dock-model-option dock-model-auto"
            disabled={disabled}
            onClick={() => choose(AUTO_ROUTER_MODEL)}
          >
            <span className="dock-choice-icon">
              <DockConnectionIcon provider="auto" />
            </span>
            <span className="dock-choice-copy">
              <strong>
                Auto <span className="dock-choice-tag">Recomendado</span>
              </strong>
              <small>Prioriza o reset mais próximo.</small>
            </span>
            <span className="dock-choice-mark" aria-hidden="true">
              {currentModel === AUTO_ROUTER_MODEL ? '✓' : '›'}
            </span>
          </button>
        )}
        {groups.map((group) => (
          <div className="dock-model-group" role="group" aria-label={group} key={group}>
            <h3>{group}</h3>
            {filtered
              .filter((model) => model.providerName === group)
              .map((model) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={currentModel === model.id}
                  data-model={model.id}
                  tabIndex={tabStop === model.id ? 0 : -1}
                  onFocus={() => setFocusedModel(model.id)}
                  key={model.id}
                  className="dock-model-option"
                  disabled={disabled}
                  onClick={() => choose(model.id)}
                  title={model.id.replace(/^9router\//, '')}
                >
                  <span className="dock-choice-icon">
                    <DockConnectionIcon provider={model.provider} />
                  </span>
                  <span className="dock-choice-copy">
                    <strong>{dockModelLabel(model.name)}</strong>
                    <small>
                      {model.accountIds.length} conta{model.accountIds.length === 1 ? '' : 's'} ·{' '}
                      {model.source === 'live' ? 'Consultado na conta' : 'Catálogo do provedor'}
                    </small>
                  </span>
                  <span className="dock-choice-mark" aria-hidden="true">
                    {currentModel === model.id ? '✓' : '›'}
                  </span>
                </button>
              ))}
          </div>
        ))}
        {overview && !filtered.length && !autoVisible && (
          <div className="dock-settings-empty">
            <strong>
              {models.length ? 'Nenhum modelo encontrado' : 'Conecte uma conta para começar'}
            </strong>
            <p>
              {models.length
                ? 'Tente outro nome ou provedor.'
                : 'Seus modelos aparecerão aqui depois da conexão.'}
            </p>
            <button
              type="button"
              onClick={
                models.length
                  ? () => {
                      setQuery('');
                      setProvider('all');
                      search.current?.focus();
                    }
                  : onConnect
              }
            >
              {models.length ? 'Limpar filtros' : 'Conectar conta'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
