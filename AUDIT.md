# Auditoria — MESP Pet

Auditoria completa realizada antes da distribuição pública. Status atual após correções.

## ✅ Resolvido

- [x] **LICENSE** — arquivo MIT criado na raiz
- [x] **`.env` protegido** — verificado que está no `.gitignore` e não foi commitado
- [x] **`asarUnpack` para node-pty** — adicionado em `package.json`
- [x] **Cleanup de PTYs no quit** — `app.on('before-quit')` mata processos órfãos
- [x] **Memory leak em `usePetBehavior`** — todos os intervals/timeouts são rastreados e limpos
- [x] **Cleanup de PTY ao trocar comando** — `KiroChatPanel` mata o PTY no cleanup do useEffect
- [x] **Debounce em `savePetState`** — 500ms para evitar gravações excessivas no drag
- [x] **Auto-start no sistema** — implementado via `app.setLoginItemSettings()`
- [x] **Dead code removido** — `DetailsPanel`, `MockControls`, `usePetState`, `localEvents`
- [x] **README atualizado** — reflete estrutura atual e novas funcionalidades
- [x] **DISTRIBUTION.md** — instruções para instalação sem code signing

## ⚠️ Pendente (não-bloqueador)

### Segurança
- [ ] `sandbox: false` — habilitar sandbox no preload (requer refatoração)
- [ ] CSP em produção mais restritiva (atual permite `ws:` e `localhost:*` para dev)
- [ ] Allowlist de comandos no terminal (atualmente qualquer comando da PATH)

### Performance
- [ ] Sprites gerados em Web Worker (atualmente bloqueia main thread no startup)
- [ ] Limpar `spriteCache` quando há muitos pets

### Distribuição
- [ ] **Code signing** (Windows EV cert + Apple Developer ID) — ~$400/ano
- [ ] **Auto-update** via `electron-updater`
- [ ] Adicionar **screenshots/GIF** no README
- [ ] Configurar **GitHub Actions** para gerar releases automaticamente

### Edge cases
- [ ] Detecção de mudança de display (multi-monitor)
- [ ] Migração de schema de persistência se o formato mudar

### Testes
- [ ] Testes para `procedural/composer.ts`, `traits.ts`, `persistence.ts`
- [ ] Teste E2E do fluxo Electron (Playwright/Spectron)

### UX
- [ ] Onboarding/tutorial no primeiro uso
- [ ] Tooltips com dicas de interações ocultas (carinho, susto)
- [ ] Anúncio de mudança de estado via `aria-live`

## 🟢 Pontos fortes

- Arquitetura main/preload/renderer correta com `contextIsolation`
- Mouse tracking sem re-renders (uso pesado de refs)
- Sprites procedurais criativos e cacheados
- Persistência com graceful degradation
- Boa separação em hooks reutilizáveis
- TypeScript estrito, ESLint + Prettier configurados
- CI básico via GitHub Actions
- Error Boundary no React
- Sanitização de args do shell
