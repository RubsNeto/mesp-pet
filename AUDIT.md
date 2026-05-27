# Auditoria — MESP Pet (produção)

Auditoria 100% para deploy em produção. Status final pós-hardening.

## ✅ Resolvido (auditoria de produção)

### Segurança / supply chain
- [x] **Electron 31 → 42** — fecha 17 CVEs conhecidas (ASAR Integrity Bypass,
      AppleScript injection, IPC spoofing, use-after-free, registry path
      injection, etc.).
- [x] **Vite 5 → 6** — fecha CVE em esbuild (dev server permitia requests
      arbitrárias da web ao processo de dev).
- [x] **electron-builder 24 → 26** — fecha 6 CVEs de path traversal /
      symlink poisoning no `tar` transitivo.
- [x] **`npm audit` zero vulnerabilidades** (era 8: 6 high + 2 moderate).
- [x] **`globals` adicionado como devDep** — eslint precisava para validar
      escopos Node em testes/scripts.

### IPC hardening (defesa em profundidade no `electron/main.ts`)
- [x] **Validação de runtime em todos os 13 handlers** — petId/runId/command
      por regex; rejeita inputs com `;`, `|`, `&`, `\n`, NUL, path traversal etc.
- [x] **Rate limits**:
  - máx **16 terminais** PTY simultâneos
  - máx **32 processos** concorrentes (`kiro:run`)
  - máx **64 args** com **4096 chars** cada
  - máx **1MB** por `terminal:write`
- [x] **safeSend** — wrapper que não chama `webContents.send` se a janela
      foi destruída (evita crash em callbacks de PTY).
- [x] **Bloqueio de navegação externa** — `will-navigate` rejeita URLs que
      não sejam o dev server ou `file://`; `setWindowOpenHandler` denya
      `window.open`.
- [x] **webPreferences endurecidos** — `webSecurity:true`,
      `allowRunningInsecureContent:false`, `experimentalFeatures:false`.
- [x] **Validação do `.env`** — só aceita chaves no padrão
      `^[A-Z_][A-Z0-9_]*$` (impede injeção de variáveis nocivas).

### Aplicação
- [x] **Cap MAX_PETS=10** — previne crescimento descontrolado de memória
      por spam no menu "Novo MESP". Persistência também trunca ao carregar.
- [x] **Item de menu desabilitado** quando o limite é atingido.

### Build & deploy
- [x] **`postinstall: electron-builder install-app-deps`** — recompila
      módulos nativos (node-pty) para a ABI da Electron instalada.
- [x] **Script `npm run rebuild-native`** — comando explícito para casos
      onde o postinstall não rodou.
- [x] **CI em matrix Ubuntu / Windows / macOS** — typecheck + lint + tests
      em todas; build + audit no Linux.
- [x] **CI permissões `contents: read`** — least-privilege no GH Actions.

### Cobertura de testes (era 9 → agora 41)
- `tests/sanitize.test.mjs` (10 testes)
  - Saneamento de metacaracteres de shell
  - Regex de PETID/RUNID/COMMAND aceitam input válido
  - Regex rejeitam injeção (path traversal, newline, NUL, comando shell)
- `tests/persistence.test.mjs` (9 testes)
  - Schema versionado, expiração de saves antigos
  - Proteção contra JSON malformado
  - `deserializeTraits` com input parcial/null/objeto vazio
- `tests/composer.test.mjs` (10 testes)
  - Grid 32x32 retornado corretamente
  - Olhos abertos têm esclera; blink/closed não têm
  - Tufo preserva miolo (não vira tudo outline)
  - Acessórios horns/halo posicionados acima do corpo
  - Paleta sempre tem hex válido
- `tests/procedural.test.mjs` (4 testes — invariantes do código fonte)
- `tests/summarize.test.mjs` (5 testes — preservados)
- `tests/kiroBridge.spawn.test.mjs` (3 testes — preservados)

## 🔍 Como verificar

```bash
npm install                 # roda postinstall que recompila node-pty pra Electron
npm run typecheck           # 0 erros
npm run lint                # 0 erros
npm test                    # 41 testes passando
npm run build               # vite + tsc, OK
npm audit                   # 0 vulnerabilidades
node scripts/preview-procedural.cjs  # gera PNGs de prévia
npm run package             # gera instalador (NSIS/DMG/AppImage)
```

## ⚠️ Pendente (não-bloqueador para v0.1, planejar pra v0.2)

### Distribuição
- [ ] **Code signing**:
  - Windows EV cert (~$300/ano) → fim do SmartScreen
  - Apple Developer ID (~$99/ano) → fim do "developer not verified"
- [ ] **Auto-update** via `electron-updater`
- [ ] Adicionar **screenshots/GIF** no README
- [ ] **App icon** — atualmente usa o ícone genérico do Electron.
      Adicionar `icon:` no `BrowserWindow` e na config `electron-builder`.
- [ ] **Build automatizado** via GitHub Actions release workflow

### Segurança (refinamentos)
- [ ] `sandbox: true` no preload — requer refatoração porque o preload
      atual usa imports CommonJS de `node-pty`. Rewrite separando.
- [ ] CSP em produção mais restritiva — atual permite `ws:` para HMR e
      `localhost:*`. Em produção pode-se servir só do `self`.
- [ ] **Allowlist de comandos** no terminal (atualmente qualquer comando
      da PATH; o uso é deliberado mas pode ser limitado em corp.).

### Observabilidade
- [ ] Crash reporter (Sentry / electron crashReporter) — opt-in.
- [ ] Telemetria mínima de uso, opt-in.

### UX
- [ ] Onboarding/tutorial no primeiro uso
- [ ] Tooltips com dicas de interações ocultas (carinho, susto)
- [ ] Anúncio de mudança de estado via `aria-live`
- [ ] Detecção de mudança de display (multi-monitor) — agora depende do
      clamp em load.

### Performance
- [ ] Sprites gerados em Web Worker (atualmente bloqueia main thread no
      startup quando muitos pets têm traits únicos).

### Funcional
- [ ] **Tasks/SpeechBubble nunca populados** — `KiroChatPanel` detecta
      estado mas não cria PetTask. Decisão: mantido — feature pode ser
      ativada quando o fluxo de "resumo da última resposta" for
      implementado.
- [ ] **`kiroBridge.ts` não é usado** — só auto-referência. API pública
      potencial; remover futuramente se não for usado.

## 🟢 Pontos fortes (mantidos / consolidados)

- Arquitetura main/preload/renderer correta com `contextIsolation`
- Mouse tracking via subscribe sem re-renders
- Sprites procedurais cacheados com eviction (limite 32)
- Persistência com schema versionado e graceful degradation
- TypeScript estrito; ESLint + Prettier configurados; **tudo passando**
- 41 testes (era 9; aumento de 4.5x)
- CI em 3 SOs
- Error Boundary no React
- Sanitização de args do shell + validação por regex
- Rate limits em todos os recursos potencialmente unbounded
- 0 vulnerabilidades conhecidas no dep tree

## 🔢 Métricas de melhoria

| Métrica | Antes | Depois |
|---|---|---|
| CVEs no dep tree | 8 (6 high + 2 mod) | **0** |
| Testes | 9 | **41** |
| Handlers IPC com validação | 0 | **13** |
| Plataformas no CI | Linux | **Linux + Windows + macOS** |
| Cap de pets | ∞ | **10** |
| Cap de PTYs | ∞ | **16** |
| Cap de processos | ∞ | **32** |
