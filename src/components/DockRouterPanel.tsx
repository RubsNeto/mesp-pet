import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUTER_PANEL_SECTIONS, type RouterPanelState } from '../../electron/dockRouterPanel.mjs';

export function DockRouterPanel({
  page,
  request,
  active,
  onNavigate,
  onClose,
}: {
  page: string;
  request: number;
  active: boolean;
  onNavigate: (page: string) => void;
  onClose: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RouterPanelState>({ page, loading: true, canGoBack: false });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(state);
  latest.current = state;
  const lastRequest = useRef('');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const canSearch =
    state.page === 'providers' || state.page === 'cli-tools' || state.page.startsWith('media-');
  const startSearch = useCallback(() => {
    setSearching(true);
    void window.mesp?.focusDock(true);
    requestAnimationFrame(() => {
      searchInput.current?.focus();
      searchInput.current?.select();
    });
  }, []);
  const closeSearch = () => {
    setSearching(false);
    setQuery('');
    requestAnimationFrame(() => searchToggle.current?.focus());
  };
  useEffect(() => {
    setSearching(false);
    setQuery('');
  }, [state.page]);
  useEffect(() => {
    if (active) window.mesp?.set9RouterPanelSearch(searching ? query : '');
  }, [active, searching, query, state.loading]);
  useEffect(() => () => window.mesp?.set9RouterPanelSearch(''), []);
  useEffect(() => {
    if (!active || !canSearch) return;
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        startSearch();
      }
    };
    const unsubscribe = window.mesp?.on9RouterSearchRequested(startSearch);
    window.addEventListener('keydown', key);
    return () => {
      unsubscribe?.();
      window.removeEventListener('keydown', key);
    };
  }, [active, canSearch, startSearch]);
  useEffect(() => window.mesp?.on9RouterPanelState(setState), []);
  useEffect(() => {
    if (!active || !window.mesp) {
      window.mesp?.hide9RouterPanel();
      return;
    }
    let stopped = false,
      frame = 0,
      previous = '';
    const measure = () => {
      const rect = viewport.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const bounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        const signature = Object.values(bounds).map(Math.round).join(',');
        if (signature !== previous) {
          window.mesp?.set9RouterPanelBounds(bounds);
          previous = signature;
        }
      }
    };
    const scheduleMeasure = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    if (viewport.current) resizeObserver.observe(viewport.current);
    const island = viewport.current?.closest('.top-dock');
    const mutations = new MutationObserver(scheduleMeasure);
    if (island)
      mutations.observe(island, { attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', scheduleMeasure);
    measure();
    const signature = `${page}:${request}`;
    const target = lastRequest.current === signature ? latest.current.page : page;
    lastRequest.current = signature;
    setState((current) => ({ ...current, loading: true, error: undefined }));
    void window.mesp
      .open9RouterPanel(target)
      .then((result) => {
        if (!stopped && !result.ok)
          setState((current) => ({
            ...current,
            loading: false,
            error: result.error || 'Não foi possível abrir o 9Router.',
          }));
      })
      .catch(() => {
        if (!stopped)
          setState((current) => ({
            ...current,
            loading: false,
            error: 'Não foi possível abrir o 9Router.',
          }));
      });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.mesp?.hide9RouterPanel();
    };
  }, [active, page, request, attempt]);
  const groups = [...new Set(ROUTER_PANEL_SECTIONS.map((item) => item.group))];
  return (
    <div className="dock-router-panel">
      <div className="dock-router-toolbar">
        <button
          className="dock-router-overview"
          onClick={onClose}
          title="Voltar aos modelos e consumo"
        >
          ← <span>Visão geral</span>
        </button>
        <button
          className="dock-router-back"
          aria-label="Voltar no 9Router"
          title="Voltar no 9Router"
          disabled={!state.canGoBack || state.loading}
          onClick={() => window.mesp?.back9RouterPanel()}
        >
          ‹
        </button>
        {searching && canSearch ? (
          <input
            className="dock-router-search-input"
            ref={searchInput}
            aria-label="Buscar opções no 9Router"
            placeholder={state.page === 'cli-tools' ? 'Buscar ferramenta…' : 'Buscar provedor…'}
            maxLength={120}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeSearch();
              }
            }}
          />
        ) : (
          <select
            aria-label="Seção do 9Router"
            value={state.page}
            onChange={(event) => onNavigate(event.target.value)}
          >
            {groups.map((group) => (
              <optgroup label={group} key={group}>
                {ROUTER_PANEL_SECTIONS.filter((item) => item.group === group).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        {canSearch && (
          <button
            ref={searchToggle}
            className="dock-router-search-toggle"
            aria-label={searching ? 'Fechar busca' : 'Buscar opções no 9Router'}
            aria-expanded={searching}
            title={searching ? 'Limpar e fechar busca · Esc' : 'Buscar opções · Ctrl+F'}
            onClick={searching ? closeSearch : startSearch}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {searching ? (
                <path d="m6 6 12 12M6 18 18 6" />
              ) : (
                <>
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m16 16 4.5 4.5" />
                </>
              )}
            </svg>
          </button>
        )}
        <span
          className={`dock-router-loading ${state.loading ? 'is-loading' : ''}`}
          aria-label={state.loading ? 'Carregando 9Router' : '9Router pronto'}
          role="status"
        />
      </div>
      <div
        className="dock-router-viewport"
        ref={viewport}
        data-router-page={state.page}
        aria-label="Painel integrado do 9Router"
      >
        {state.loading && (
          <div className="dock-router-placeholder">
            <span className="dock-router-orbit" />
            <strong>Preparando seu painel…</strong>
          </div>
        )}
        {state.error && (
          <div className="dock-router-placeholder" role="alert">
            <strong>{state.error}</strong>
            <button onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button>
          </div>
        )}
      </div>
      <div className="dock-router-caption">
        <span>9Router no seu MESP</span>
        <span>Contas · ferramentas · ajustes</span>
      </div>
    </div>
  );
}
