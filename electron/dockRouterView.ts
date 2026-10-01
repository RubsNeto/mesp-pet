import { BrowserWindow, WebContentsView, shell } from 'electron';
import { ROUTER_THEME_CSS } from './dockRouter.mjs';
import {
  ROUTER_COMPACT_CSS,
  ROUTER_CATALOG_SCRIPT,
  routerPanelBounds,
  routerPanelPage,
  routerPanelSection,
  type RouterPanelRect,
  type RouterPanelState,
} from './dockRouterPanel.mjs';

/** One sandboxed native view, attached to the island's existing window. */
export class DockRouterView {
  private view: WebContentsView | null = null;
  private origin = '';
  private bounds: RouterPanelRect | null = null;
  private wanted = false;
  private styled = false;
  private preparing = false;
  private state: RouterPanelState = { page: 'providers', loading: true, canGoBack: false };
  private revision = 0;
  private searchTerm = '';

  constructor(
    private parent: BrowserWindow,
    private headers: (origin: string) => Record<string, string>,
    private emit: (state: RouterPanelState) => void,
  ) {}

  private publish(update: Partial<RouterPanelState> = {}) {
    this.state = { ...this.state, ...update };
    const contents = this.view?.webContents;
    if (contents && !contents.isDestroyed()) {
      this.state.canGoBack = contents.navigationHistory.canGoBack();
      try {
        this.state.page = routerPanelPage(new URL(contents.getURL()).pathname);
      } catch {
        /* Not yet loaded. */
      }
    }
    this.emit(this.state);
  }

  private visibility() {
    this.view?.setVisible(
      this.wanted && this.styled && !this.preparing && !!this.bounds && !this.state.error,
    );
  }

  setBounds(raw: unknown) {
    const [width, height] = this.parent.getContentSize();
    const next = routerPanelBounds(raw, { width, height });
    if (next && JSON.stringify(next) !== JSON.stringify(this.bounds)) this.view?.setBounds(next);
    this.bounds = next;
    this.wanted = !!next;
    this.visibility();
  }

  hitRegion() {
    return this.wanted && this.styled && !this.preparing && !this.state.error ? this.bounds : null;
  }
  hide() {
    this.revision++;
    this.wanted = false;
    this.visibility();
  }
  setSearch(value: unknown) {
    this.searchTerm = typeof value === 'string' ? value.slice(0, 120) : '';
    if (this.styled && this.view && !this.view.webContents.isDestroyed())
      void this.applySearch().catch(() => {});
  }
  private async applySearch() {
    await this.view?.webContents.executeJavaScript(
      `window.__mespCatalogSearch?.(${JSON.stringify(this.searchTerm)})`,
    );
  }
  ticket() {
    this.preparing = true;
    this.visibility();
    return ++this.revision;
  }
  current(ticket: number) {
    return ticket === this.revision && !this.parent.isDestroyed();
  }

  async open(origin: string, page: unknown, ticket: number) {
    if (!this.current(ticket)) return { ok: true };
    this.preparing = false;
    if (this.view && this.origin !== origin) this.dispose();
    const section = routerPanelSection(page);
    if (!this.view) {
      this.origin = origin;
      const view = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          backgroundThrottling: false,
          partition: 'mesp-router-local',
        },
      });
      this.view = view;
      view.setBackgroundColor('#101010');
      view.setBorderRadius(12);
      view.setVisible(false);
      if (this.bounds) view.setBounds(this.bounds);
      this.parent.contentView.addChildView(view);
      const contents = view.webContents;
      contents.session.webRequest.onBeforeSendHeaders(
        { urls: [`${origin}/*`] },
        (details, callback) => {
          const auth = this.headers(origin),
            requestHeaders = { ...details.requestHeaders };
          if (auth.cookie) {
            const others = (requestHeaders.Cookie || requestHeaders.cookie || '')
              .split(';')
              .filter((cookie) => cookie.trim() && !cookie.trim().startsWith('auth_token='));
            delete requestHeaders.cookie;
            requestHeaders.Cookie = [...others, auth.cookie].join('; ');
          }
          callback({ requestHeaders });
        },
      );
      const external = (url: string) => {
        try {
          const target = new URL(url);
          if (target.origin === origin) void contents.loadURL(url).catch(() => {});
          else if (target.protocol === 'https:' || target.protocol === 'http:')
            void shell.openExternal(url);
        } catch {
          /* Reject invalid URLs. */
        }
      };
      contents.setWindowOpenHandler(({ url }) => {
        external(url);
        return { action: 'deny' };
      });
      const protect = (event: Electron.Event, url: string) => {
        try {
          if (new URL(url).origin === origin) return;
        } catch {
          /* Reject invalid URLs. */
        }
        event.preventDefault();
        external(url);
      };
      contents.on('will-navigate', protect);
      contents.on('will-redirect', protect);
      contents.on('did-start-loading', () => this.publish({ loading: true, error: undefined }));
      contents.on('did-stop-loading', () => {
        if (this.styled) this.publish({ loading: false });
      });
      contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) {
          this.styled = false;
          this.visibility();
          this.publish({ loading: true });
        }
      });
      contents.on('did-navigate-in-page', () => this.publish());
      contents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        if ((input.control || input.meta) && input.key.toLowerCase() === 'k') {
          event.preventDefault();
          this.parent.webContents.focus();
          this.parent.webContents.send('dock:focus-chat');
          return;
        }
        if ((input.control || input.meta) && input.key.toLowerCase() === 'f') {
          const pathname = new URL(contents.getURL()).pathname;
          if (
            pathname === '/dashboard/providers' ||
            pathname === '/dashboard/cli-tools' ||
            /^\/dashboard\/media-providers\/[^/]+$/.test(pathname)
          ) {
            event.preventDefault();
            this.parent.webContents.focus();
            this.parent.webContents.send('dock:router-search');
          }
          return;
        }
        if (input.key !== 'Escape') return;
        // Native dialogs get first use of Escape; otherwise collapse the island.
        void contents
          .executeJavaScript(
            "Array.from(document.querySelectorAll('[role=dialog], .fixed.inset-0')).some(element => getComputedStyle(element).display !== 'none')",
          )
          .then((modalOpen) => {
            if (!modalOpen && !this.parent.isDestroyed())
              this.parent.webContents.send('dock:router-escape');
          })
          .catch(() => {});
      });
      contents.on('dom-ready', () => {
        void (async () => {
          if (contents.isDestroyed() || !contents.getURL().startsWith(`${origin}/`)) return;
          await contents.insertCSS(`${ROUTER_THEME_CSS}\n${ROUTER_COMPACT_CSS}`);
          await contents.executeJavaScript(
            "document.documentElement.classList.add('dark'); localStorage.setItem('theme', JSON.stringify({state:{theme:'dark'},version:0})); new MutationObserver(() => { if (!document.documentElement.classList.contains('dark')) document.documentElement.classList.add('dark'); }).observe(document.documentElement, {attributes:true,attributeFilter:['class']}); document.title='MESP · Configurações';",
          );
          await contents.executeJavaScript(ROUTER_CATALOG_SCRIPT);
          if (this.view !== view) return;
          await this.applySearch();
          this.styled = true;
          this.visibility();
          this.publish({ loading: contents.isLoading() });
        })().catch(() =>
          this.publish({
            loading: false,
            error: 'Não foi possível preparar o painel. Tente novamente.',
          }),
        );
      });
      contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) {
          this.publish({
            loading: false,
            error: 'Não foi possível carregar o 9Router. Tente novamente.',
          });
          this.visibility();
        }
      });
      contents.on('render-process-gone', () => {
        this.styled = false;
        this.publish({ loading: false, error: 'O painel parou de responder. Tente novamente.' });
        this.visibility();
      });
    }
    const contents = this.view.webContents;
    const currentURL = contents.getURL();
    const currentPage = currentURL.startsWith(`${origin}/`)
      ? routerPanelPage(new URL(currentURL).pathname)
      : undefined;
    // Hiding the island preserves the page, OAuth state, modal and unsaved input.
    if (!this.state.error && this.styled && currentPage === section.id) {
      this.publish();
      this.visibility();
      return { ok: true };
    }
    this.styled = false;
    this.publish({ page: section.id, loading: true, error: undefined });
    this.visibility();
    try {
      await contents.loadURL(new URL(section.path, `${origin}/`).toString());
      return { ok: true };
    } catch {
      if (this.current(ticket))
        this.publish({ loading: false, error: 'Não foi possível abrir o painel do 9Router.' });
      return { ok: false, error: 'Não foi possível abrir o painel do 9Router.' };
    }
  }

  back() {
    if (this.view?.webContents.navigationHistory.canGoBack())
      this.view.webContents.navigationHistory.goBack();
  }
  dispose() {
    const view = this.view;
    this.view = null;
    this.styled = false;
    if (!view) return;
    if (!this.parent.isDestroyed()) this.parent.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
