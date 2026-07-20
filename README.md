# MESP Pet 🐾

Pet desktop em pixel art que vira o **MESP Code**: um chat de programação próprio,
movido pelo OpenCode e conectado ao 9Router. Construído com **Electron + Vite +
React + TypeScript**.

O MESP fica numa janela transparente sempre acima das demais, reage aos estados
do agente (thinking, working, waiting, success, error...) e abre o chat ao ser clicado.

---

## ✨ Recursos

### Visual

- Janela 100% transparente, sempre acima, com pass-through de cliques nas áreas vazias.
- Pet em pixel art animado com 8 estados: `idle`, `walking`, `thinking`, `working`, `success`, `error`, `sleeping`, `sitting`.
- **Variação por pet**: cada novo MESP escolhe uma de 12 famílias de cor (sky, rose, mint, lemon, lilac, peach, lavender, cream, aqua, coral, sage, ghost), pode receber 1 acessório (chifres, orelhas, antena, lacinho, auréola, florzinha, estrela) e 1 padrão (manchas, faixa, barriga clara, coração no peito).
- De 1 a 3 olhos com pupilas que seguem o cursor; brilhinhos no estado `sparkle`; corpo inclina sutilmente na direção do mouse.
- Sprites gerados 100% proceduralmente em código — para visualizar variantes sem rodar o app, use `node scripts/preview-procedural.cjs`.

### Interações

- **Arrastar** pela tela.
- **Clique** abre/fecha o MESP Code.
- **Duplo clique** faz pulinho de alegria.
- **Acariciar**: clique e segure → corações ❤️ flutuam.
- **Susto**: 4+ cliques rápidos → pet treme e foge.
- **Bolinha** 🎾: menu → "Dropar bolinha" — pet persegue.
- **Múltiplos MESPs** simultâneos.

### MESP Code e terminal CLI

- Chat nativo do MESP com OpenCode headless, sessão contínua e eventos de ferramentas.
- Instalação integrada: OpenCode, 9Router, Node e npm são empacotados com o MESP e não precisam ser instalados separadamente.
- Quatro modos de trabalho: **Rápido** (9Router direto e contexto curto), **Plano** (somente leitura), **Assistido** (aprovação para ações sensíveis) e **Autônomo** (acesso total sem confirmação).
- Métricas por resposta: tempo até o primeiro token, duração total e tokens consumidos.
- Linha do tempo por resposta, com início, primeiro token, ferramentas, conclusão, cancelamento e verificações.
- Fila sequencial de até 10 tarefas, com modo, modelo, limites e pasta capturados ao adicionar.
- Quality gates manuais ou automáticos após tarefas Assistidas e Autônomas.
- Compactação automática com poda de saídas antigas de ferramentas e watcher ignorando pastas pesadas.
- Catálogo pesquisável sincronizado com todos os modelos do 9Router (Codex, Kiro, GitHub e novos provedores/modelos).
- MESP animado no cabeçalho, reagindo em tempo real ao trabalho do agente.
- Terminal real (xterm.js + node-pty) mantido para os demais presets.
- **Suporte multi-IA via presets**: MESP Code, Claude Code, Kiro CLI, Aider, Gemini, Codex, GitHub Copilot, Cursor — ou personalizado.
- Detecção automática de quais CLIs estão instaladas no seu sistema.
- Detecção automática de estados a partir do output (`thinking` → `working` → `success`/`error`).
- Configuração via `.env` ou pelo painel ⚙ do terminal.

#### Modos do agente

- **Rápido**: envia a conversa diretamente ao endpoint compatível com OpenAI do 9Router. Mantém no máximo as 8 mensagens recentes e 12 mil caracteres de contexto. Não lê nem altera arquivos.
- **Plano**: usa o agente `mesp-plan`. Pode analisar os arquivos do projeto, mas `edit`, `bash`, `task` e acesso externo ficam bloqueados.
- **Assistido**: permite leitura e análise livremente, mas pausa antes de edições, comandos e outras ações sensíveis para pedir aprovação.
- **Autônomo**: usa o agente `mesp-autonomous` com `--auto` e permissão global `allow`. Pode ler, editar e executar comandos sem pedir confirmação; o painel exige uma confirmação explícita antes de ativá-lo.

O seletor de modelos continua dinâmico. Abrir o painel ou usar o botão de sincronização consulta `/models` no 9Router, portanto modelos adicionados depois aparecem sem alterar o app. Há filtros para Codex, Kiro, GitHub e modelos open source.

O MESP inicia o 9Router integrado somente em `127.0.0.1` e guarda seus dados no diretório privado do aplicativo. Na primeira execução, use **Configurar provedores** para abrir o painel local em uma janela isolada e conectar as contas desejadas. Logins, tokens e chaves são pessoais: não fazem parte do instalador e nunca atravessam o IPC do renderer. Configurações externas existentes continuam compatíveis por `options.apiKey`, `{env:NINEROUTER_API_KEY}` ou `NINEROUTER_BASE_URL`.

#### Fila e linha do tempo

Enquanto uma resposta ou verificação está em andamento, `Enter` adiciona a mensagem à fila e `Shift+Enter` continua inserindo uma quebra de linha. As tarefas são executadas uma por vez, na ordem em que entraram; cancelar a tarefa atual preserva as pendentes e pausa a fila para revisão. O botão **Retomar** libera a próxima tarefa, e cada item pendente pode ser removido individualmente.

A fila fica vinculada à pasta do projeto. Trocar a pasta interrompe o trabalho da pasta anterior e remove suas tarefas pendentes para evitar execução no diretório errado. Iniciar uma nova conversa também limpa a fila explicitamente. A linha do tempo de cada resposta mantém somente os eventos recentes necessários e aceita conversas antigas salvas sem esse campo.

#### Quality gates

O MESP descobre exclusivamente estes nomes de scripts no `package.json` da raiz do projeto:

- `typecheck`
- `lint`
- `test`
- `build`
- `check`

O renderer envia apenas os nomes selecionados, e o processo principal os valida novamente contra a lista permitida e contra os scripts realmente existentes antes de usar `npm run`. Não é possível enviar um comando arbitrário por esse IPC.

Os gates selecionados rodam sequencialmente. A primeira falha impede os seguintes, e stdout/stderr aparecem separadamente com limites de tamanho e duração. **Esses scripts executam código do próprio projeto com as permissões do usuário atual**, portanto use quality gates somente em repositórios confiáveis.

O botão **Verificar projeto** executa os gates manualmente em uma resposta concluída. A opção **Verificar automaticamente** roda após tarefas dos modos Assistido e Autônomo; o modo Rápido e o modo Plano não iniciam verificação automática. Uma falha manual apenas registra o resultado. Uma falha automática pausa as tarefas que ainda estiverem na fila até que o usuário pressione **Retomar**. Para cancelar, use **Parar verificação** no compositor; o MESP aguarda o encerramento do processo e de seus subprocessos antes de concluir o cancelamento.

Limitações atuais:

- há no máximo uma verificação simultânea por MESP e quatro no aplicativo;
- somente o `package.json` da raiz da pasta selecionada é inspecionado;
- Node e npm já acompanham o instalador, mas as dependências de cada projeto ainda precisam estar instaladas e alguns scripts podem exigir ferramentas específicas do projeto;
- saídas e durações são limitadas para manter o aplicativo responsivo;
- a fila usa o mesmo working tree do projeto; worktrees isoladas por tarefa ainda não foram implementadas.

### Sistema

- **Auto-start no Windows/Mac/Linux** — opção no menu de contexto: "Iniciar com o sistema".
- **Persistência** de posição dos pets (localStorage, debounced).
- Cleanup automático de processos ao fechar o app.

---

## 🚀 Instalação

### Usuário final

Baixe o instalador da [página de releases](https://github.com/RubsNeto/mesp-pet/releases). A automação atual publica o instalador NSIS para Windows.

O instalador é autocontido para a plataforma em que foi gerado: ele leva o aplicativo, OpenCode, 9Router e os runtimes Node/npm usados pelos quality gates. Depois de instalar, abra o MESP, entre no MESP Code e clique em **Configurar provedores**. É necessário conectar pelo menos um provedor e ter acesso à internet para usar seus modelos; nenhuma credencial é distribuída junto com o aplicativo.

Projetos clonados em outro computador continuam sendo projetos normais: rode a instalação de dependências exigida pelo próprio repositório antes de usar seus scripts de `test`, `build`, `lint` ou `typecheck`. Compiladores, SDKs, Git e outras ferramentas externas que um projeto específico invoque não são substituídos pelo runtime integrado.

> ⚠️ O binário ainda **não é assinado**. Windows pode mostrar SmartScreen e Mac pode bloquear via Gatekeeper. Veja [DISTRIBUTION.md](DISTRIBUTION.md) para instruções de "permitir mesmo assim".

### Desenvolvimento

```bash
git clone https://github.com/RubsNeto/mesp-pet.git
cd mesp-pet
npm install
npm run dev      # Vite dev server + Electron com HMR
```

Build de produção:

```bash
npm run build           # build dos assets
npm run package         # gera o instalador em release/
```

### Publicar o instalador no GitHub

O diretório `release/` é ignorado pelo Git de propósito: instaladores não devem entrar no histórico do repositório. O workflow **Publicar instalador Windows** executa testes, typecheck e lint, gera o pacote em um runner Windows e anexa o `.exe` diretamente a uma GitHub Release.

Há duas formas de iniciar a publicação depois que o código e o workflow estiverem na branch `main`:

- abra **Actions → Publicar instalador Windows → Run workflow**; se a tag ficar vazia, será usada `v` seguida da versão de `package.json`;
- ou envie uma tag igual à versão de `package.json`, por exemplo `v0.1.0`.

Cada versão pode ser publicada apenas uma vez. Para uma nova publicação, atualize a versão em `package.json` e `package-lock.json`. O workflow também guarda uma cópia temporária nos artefatos da execução. Nenhuma chave do 9Router é usada ou incluída no instalador; a publicação recebe somente a credencial temporária fornecida pelo GitHub Actions para criar a Release.

---

## ⚙️ Configuração

O MESP Code integrado não exige `.env` nem instalação global de OpenCode/9Router. O painel local do 9Router é o caminho recomendado para conectar provedores. As variáveis abaixo permanecem disponíveis apenas para o terminal de presets e cenários avançados de compatibilidade.

Crie um arquivo `.env` na raiz (use `.env.example` como base):

```
KIRO_COMMAND=9code
KIRO_TASK_PREFIX=
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
│   │   ├── KiroChatPanel.tsx# Painel do agente + terminal xterm
│   │   ├── MespCodeChat.tsx # Chat nativo sobre OpenCode headless
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

| Script              | Descrição                          |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Dev server com HMR + Electron      |
| `npm run build`     | Build TypeScript + Vite            |
| `npm start`         | Roda o app já buildado             |
| `npm run typecheck` | Só verifica tipos                  |
| `npm run lint`      | ESLint                             |
| `npm run format`    | Prettier                           |
| `npm test`          | Testes Node nativos                |
| `npm run package`   | Gera instalador (electron-builder) |

---

## 🛡️ Segurança

- `contextIsolation: true`, `nodeIntegration: false`
- Renderer só acessa o que é exposto via `contextBridge` no preload
- CSP definida no `index.html`
- O prompt do MESP Code é passado diretamente ao executável, sem shell; comandos genéricos do terminal são validados e sanitizados.
- O modo Plano bloqueia escrita, shell, tarefas delegadas e diretórios externos. O modo Autônomo é o oposto: só é ativado após um aviso explícito de acesso irrestrito.

⚠️ **Limitação conhecida**: o terminal e o modo Autônomo podem executar comandos e alterar arquivos acessíveis pelo usuário do sistema. Use o Autônomo apenas em projetos confiáveis.

---

## 🧹 Troubleshooting

**MESP Code não mostra modelos**: clique em **Configurar provedores**, conecte pelo menos uma conta no 9Router integrado e depois use **Tentar novamente**. O catálogo é sincronizado ao abrir o painel; não é necessário instalar OpenCode ou 9Router globalmente.

**9Router recusa a autenticação**: reabra **Configurar provedores** e renove o login da conta. Se estiver usando um 9Router remoto por compatibilidade, atualize a credencial configurada e tente novamente. O MESP nunca mostra a credencial na interface ou nos erros.

**Outro preset mostra "desconectado"**: o comando configurado não está na PATH. Edite via ⚙ ou configure `KIRO_COMMAND` no `.env`.

**Pet não aparece**: clique direito em qualquer lugar (se houver pet salvo) ou abra o devtools com Ctrl+Shift+I para ver erros. Para resetar tudo: clique direito no pet → "Resetar pets".

**Pet salvo em posição inválida** (ex: troquei de monitor): use "Resetar pets" no menu de contexto.

**Auto-start não funciona no Linux**: o suporte de `app.setLoginItemSettings()` no Linux varia por distribuição. Em alguns casos é preciso configurar manualmente em `~/.config/autostart/`.

---

## 📜 Licença

[MIT](LICENSE)
