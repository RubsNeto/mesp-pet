# MESP Pet 🐾

Pet desktop em pixel art que serve como **assistente visual** para a Kiro CLI (ou
qualquer outro comando de terminal). Construído com **Electron + Vite + React +
TypeScript**.

O MESP fica numa janela transparente sempre acima das demais, reage aos estados
do agente (thinking, working, success, error...) e abre um **terminal completo**
ao ser clicado.

---

## ✨ Recursos

### Visual
- Janela 100% transparente, sempre acima, com pass-through de cliques nas áreas vazias.
- Pet em pixel art animado com 8 estados: `idle`, `walking`, `thinking`, `working`, `success`, `error`, `sleeping`, `sitting`.
- **Variação por pet**: cada novo MESP escolhe uma de 12 famílias de cor (sky, rose, mint, lemon, lilac, peach, lavender, cream, aqua, coral, sage, ghost), pode receber 1 acessório (chifres, orelhas, antena, lacinho, auréola, florzinha, estrela) e 1 padrão (manchas, faixa, barriga clara, coração no peito).
- 2 olhinhos com pupilas que seguem o cursor (cada uma independente); brilhinhos no estado `sparkle`; corpo inclina sutilmente na direção do mouse.
- Sprites gerados 100% proceduralmente em código — para visualizar variantes sem rodar o app, use `node scripts/preview-procedural.cjs`.

### Interações
- **Arrastar** pela tela.
- **Clique** abre/fecha o terminal.
- **Duplo clique** faz pulinho de alegria.
- **Acariciar**: clique e segure → corações ❤️ flutuam.
- **Susto**: 4+ cliques rápidos → pet treme e foge.
- **Bolinha** 🎾: menu → "Dropar bolinha" — pet persegue.
- **Múltiplos MESPs** simultâneos.

### Terminal CLI
- Terminal real (xterm.js + node-pty) integrado, persistente por pet.
- **Suporte multi-IA via presets**: Claude Code, Kiro CLI, Aider, Gemini, Codex, GitHub Copilot, Cursor — ou personalizado.
- Detecção automática de quais CLIs estão instaladas no seu sistema.
- Detecção automática de estados a partir do output (`thinking` → `working` → `success`/`error`).
- Configuração via `.env` ou pelo painel ⚙ do terminal.

### Sistema
- **Auto-start no Windows/Mac/Linux** — opção no menu de contexto: "Iniciar com o sistema".
- **Persistência** de posição dos pets (localStorage, debounced).
- Cleanup automático de processos ao fechar o app.

---

## 🚀 Instalação

### Usuário final

Baixe o instalador da [página de releases](https://github.com/SEU-USUARIO/mesp-pet/releases) (Windows NSIS, Mac DMG ou Linux AppImage).

> ⚠️ O binário ainda **não é assinado**. Windows pode mostrar SmartScreen e Mac pode bloquear via Gatekeeper. Veja [DISTRIBUTION.md](DISTRIBUTION.md) para instruções de "permitir mesmo assim".

### Desenvolvimento

```bash
git clone https://github.com/SEU-USUARIO/mesp-pet.git
cd mesp-pet
npm install
npm run dev      # Vite dev server + Electron com HMR
```

Build de produção:

```bash
npm run build           # build dos assets
npm run package         # gera o instalador em release/
```

---

## ⚙️ Configuração

Crie um arquivo `.env` na raiz (use `.env.example` como base):

```
KIRO_COMMAND=kiro-cli
KIRO_TASK_PREFIX=chat
KIRO_DEFAULT_ARGS=
```

Ou edite via UI: clique no pet → ícone ⚙ no header do terminal.

---

## 📂 Estrutura

```
mesp-pet/
├── electron/
│   ├── main.ts              # Processo principal: janela, IPC, PTY, auto-start
│   └── preload.ts           # Bridge segura window.mesp
├── src/
│   ├── App.tsx              # Raiz (com ErrorBoundary)
│   ├── main.tsx             # Entry React
│   ├── types.ts             # Tipos compartilhados
│   ├── components/
│   │   ├── PetManager.tsx   # Orquestrador
│   │   ├── Pet.tsx          # Sprite + drag + interações
│   │   ├── KiroChatPanel.tsx# Terminal xterm
│   │   ├── ContextMenu.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Hearts.tsx       # Corações flutuantes
│   │   ├── Toy.tsx          # Bolinha
│   │   └── SpeechBubble.tsx
│   ├── hooks/
│   │   ├── usePetAnimation.ts
│   │   ├── useMousePosition.ts
│   │   ├── usePetBehavior.ts # Auto-sleep, caminhadas
│   │   ├── usePassThrough.ts # Click pass-through Electron
│   │   └── useInteractions.ts# Hearts e toys
│   ├── procedural/
│   │   ├── composer.ts      # Composição de sprites
│   │   ├── traits.ts        # Variação aleatória
│   │   ├── palette.ts
│   │   ├── primitives.ts    # fillEllipse, applyOutline...
│   │   └── render.ts        # Grid → data URL
│   ├── services/
│   │   ├── persistence.ts   # localStorage
│   │   ├── kiroBridge.ts
│   │   └── summarize.ts
│   ├── assets/sprites/index.ts
│   └── styles/global.css
├── tests/                    # Testes Node nativos
├── .env.example
├── eslint.config.js
├── electron-builder config (em package.json)
└── README.md
```

---

## 🔧 Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | Dev server com HMR + Electron |
| `npm run build` | Build TypeScript + Vite |
| `npm start` | Roda o app já buildado |
| `npm run typecheck` | Só verifica tipos |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Testes Node nativos |
| `npm run package` | Gera instalador (electron-builder) |

---

## 🛡️ Segurança

- `contextIsolation: true`, `nodeIntegration: false`
- Renderer só acessa o que é exposto via `contextBridge` no preload
- CSP definida no `index.html`
- Args passados ao `spawn` são sanitizados (remove `; | & \` $ ( ) { } [ ] < > \n \r`)

⚠️ **Limitação conhecida**: o terminal permite executar qualquer comando que esteja na PATH. Não use o app em ambientes onde isso seja um problema.

---

## 🧹 Troubleshooting

**Terminal mostra "desconectado"**: o comando configurado (default `kiro-cli`) não está na PATH. Edite via ⚙ ou configure `KIRO_COMMAND` no `.env`.

**Pet não aparece**: clique direito em qualquer lugar (se houver pet salvo) ou abra o devtools com Ctrl+Shift+I para ver erros. Para resetar tudo: clique direito no pet → "Resetar pets".

**Pet salvo em posição inválida** (ex: troquei de monitor): use "Resetar pets" no menu de contexto.

**Auto-start não funciona no Linux**: o suporte de `app.setLoginItemSettings()` no Linux varia por distribuição. Em alguns casos é preciso configurar manualmente em `~/.config/autostart/`.

---

## 📜 Licença

[MIT](LICENSE)
