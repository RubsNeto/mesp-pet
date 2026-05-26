# MESP Pet 🐾

Pet desktop em pixel art que serve como **assistente visual** para a Kiro CLI (ou
qualquer outro comando de terminal). Construído com **Electron + Vite + React +
TypeScript**.

O MESP fica numa janela transparente sempre acima das demais, reage aos estados
do agente (thinking, working, success, error...), mostra um balão pequeno com
o **resumo** da última resposta e abre um **painel completo** ao ser clicado.

---

## ✨ Recursos

- Janela 100% transparente, sempre acima, com pass-through de cliques nas áreas
  vazias (não atrapalha o que está atrás).
- Pet em pixel art animado, com vários estados:
  `idle`, `walking`, `thinking`, `working`, `success`, `error`, `sleeping`,
  `sitting`.
- Pet pode ser **arrastado** pela tela (segura e arrasta).
- **Múltiplos MESPs** ao mesmo tempo, cada um com tinta de cor diferente
  (CSS `hue-rotate`) sem perder a pixel art.
- Balão de fala curto + painel de detalhes com botão **Copiar**.
- Menu de contexto (clique direito): novo MESP, dormir/acordar, sentar,
  abrir painel, esconder balão, remover, fechar app.
- Comportamento autônomo: dorme após ~60s sem atividade, ocasionalmente
  caminha em idle.
- Bridge real para a **Kiro CLI** (ou qualquer comando: `node`, `npm`, `git`...)
  via `child_process.spawn`, configurável por `.env`.
- Modo **mock** completo para testar sem depender da Kiro CLI.

---

## 📦 Estrutura

```
mesp-pet/
├── electron/
│   ├── main.ts          # processo principal (janela transparente, IPC, bridge)
│   └── preload.ts       # expõe API segura para o renderer
├── scripts/
│   └── extract-sprites.js   # copia sprites do ZIP para src/assets/sprites/mesp
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── types.ts
│   ├── components/
│   │   ├── Pet.tsx
│   │   ├── SpeechBubble.tsx
│   │   ├── DetailsPanel.tsx
│   │   ├── ContextMenu.tsx
│   │   ├── MockControls.tsx
│   │   └── PetManager.tsx
│   ├── hooks/
│   │   ├── usePetAnimation.ts
│   │   └── usePetState.ts
│   ├── services/
│   │   ├── kiroBridge.ts
│   │   ├── summarize.ts
│   │   └── localEvents.ts
│   ├── assets/
│   │   └── sprites/
│   │       ├── index.ts     # mapeia sprites por estado
│   │       └── mesp/        # PNGs (gerados pelo extract-sprites)
│   └── styles/
│       └── global.css
├── index.html
├── package.json
├── tsconfig*.json
├── vite.config.ts
├── .env.example
└── README.md
```

---

## 🚀 Instalação

```bash
npm install
```

> O hook `predev`/`prebuild` chama `scripts/extract-sprites.js`, que tenta
> popular `src/assets/sprites/mesp/` automaticamente. Veja a seção
> [Sprites](#-sprites) para detalhes.

---

## ▶️ Rodando em desenvolvimento

```bash
npm run dev
```

Esse comando:

1. Roda o `extract-sprites` para garantir que os PNGs estão em
   `src/assets/sprites/mesp/`.
2. Sobe o Vite em `http://localhost:5173`.
3. `vite-plugin-electron` compila `electron/main.ts` e `electron/preload.ts` em
   `dist-electron/` e abre a janela do Electron automaticamente.

A janela é transparente. Você verá o MESP no centro da tela e o painel de
controles no canto inferior direito.

---

## 🏗️ Build de produção

```bash
npm run build
```

Gera:

- `dist/` com o renderer (HTML + JS) pronto.
- `dist-electron/` com o `main.js` e `preload.js`.

Para abrir o app já buildado (sem rodar `dev`):

```bash
npm run start
```

Para gerar instaladores (Windows `.exe`, Mac `.dmg`, Linux `AppImage`):

```bash
npm run package
```

> O `electron-builder` é usado com a configuração default em `package.json` →
> `build`. Saída em `release/`.

---

## 🖼️ Sprites

Os PNGs ficam em `src/assets/sprites/mesp/`. Eles são consumidos por
`src/assets/sprites/index.ts`, que agrupa por estado:

| Estado     | Sprites usados                                                                 |
| ---------- | ------------------------------------------------------------------------------ |
| `idle`     | `mesp_frente_idle_01..05` + `mesp_frente_piscando`                             |
| `walking`  | `mesp_perfil_esquerda_passo_01..04` (espelhado para a direita via `scaleX(-1)`) |
| `thinking` | `mesp_confuso` + `mesp_frente_idle_01`                                         |
| `working`  | `mesp_alerta_01/02` alternados com idle                                        |
| `success`  | `mesp_frente_boca_aberta` + idles alegres                                      |
| `error`    | `mesp_confuso`                                                                 |
| `sleeping` | `mesp_dormindo`                                                                |
| `sitting`  | `mesp_frente_sentado_01..03`                                                   |

### Como trocar sprites

1. Abra `src/assets/sprites/index.ts`.
2. Para mudar o conjunto de frames de um estado, edite o array em
   `STATE_FRAMES`. Você pode importar novos PNGs no topo do arquivo.
3. Para alterar a velocidade da animação, edite `STATE_FPS`.
4. Coloque os novos PNGs em `src/assets/sprites/mesp/` (ou em qualquer lugar
   dentro de `src/assets`, contanto que o caminho do `import` esteja correto).

### Como repor os sprites a partir do ZIP

Se a pasta `src/assets/sprites/mesp/` ficar vazia (por exemplo após um
`git clean`), basta:

```bash
npm run extract-sprites
```

O script tenta, na ordem:

1. Usar PNGs já existentes em `sprites_extracted/sprites_bixinho_nomeado/padronizados_256x224_nomeados/` (preferido).
2. Cair para `sprites_extracted/sprites_bixinho_nomeado/transparentes_nomeados/`.
3. Procurar o ZIP `sprites_bixinho_mesp_nomeado.zip` na raiz do projeto **ou**
   em `~/Downloads/`, e descompactar antes de copiar.

---

## 🔌 Integração com a Kiro CLI

A integração principal é o **chat panel** (`KiroChatPanel`): você clica no
MESP e ele abre uma janelinha com input + histórico das tarefas, exatamente
como um terminal simples para a Kiro CLI, com a saída de `stdout`/`stderr`
chegando em tempo real.

### Fluxo do usuário

1. **Clique no MESP** (com botão esquerdo). Abre o chat panel.
2. Digite uma tarefa no input (ex.: `refatora o arquivo X.ts`).
3. **Enter** envia (Shift+Enter quebra linha).
4. O pet vai para `working`, o painel mostra a saída do `kiro` em streaming
   com um cursor piscando.
5. Ao terminar, o status fica `success` ou `error`, o balão mostra um resumo
   curto e há um botão **copiar** na mensagem.
6. Você pode enviar a próxima tarefa imediatamente — o histórico fica visível.
7. **Esc** fecha o chat sem afetar o pet.

### Configuração

Copie `.env.example` para `.env` e edite:

```env
KIRO_COMMAND=kiro          # comando a executar (PATH ou caminho absoluto)
KIRO_TASK_PREFIX=          # args fixos antes do prompt (ex.: "chat" ou "run")
KIRO_DEFAULT_ARGS=         # usado pelo "Executar" do MockControls
```

Esses valores são lidos pelo processo principal do Electron e expostos ao
chat panel via IPC. Você também pode editá-los **em runtime** no botão ⚙ do
header do chat panel sem reiniciar o app.

### O que rola por baixo

```
[input do chat] → submitPrompt(petId, "refatora X")
                  ↓
                  args = [...parseShellArgs(KIRO_TASK_PREFIX), "refatora X"]
                  ↓
                  spawn(KIRO_COMMAND, args, { shell: true on Win })
                  ↓
                  stdout/stderr → IPC streaming → atualiza pet.history[ult].fullText
                  ↓
                  exit code 0 → success ; ≠ 0 → error
                  ↓
                  pet.task.summary = summarize(fullText)
```

O `kiroBridge` foi desenhado para ser genérico: roda **qualquer** comando de
terminal. Você pode testar sem ter a Kiro instalada usando `node`, `npm`,
`echo`, `git status`, etc.

### Programaticamente

```ts
import { runKiroCommand } from '@/services/kiroBridge';

const result = await runKiroCommand({
  command: 'node',
  args: ['-v'],
  onStatus: (s) => console.log('status:', s),
  onStdout: (chunk) => console.log(chunk),
});

console.log(result.summary);
console.log(result.fullText);
```

Em qualquer ambiente sem Electron (browser puro, testes), o bridge cai
automaticamente para o modo mock.

---

## 🧪 Modo mock (testar sem a Kiro)

No painel **MESP controls**:

- **thinking** / **working**: força o estado correspondente.
- **success** / **error**: roda uma tarefa simulada com resposta fake.
- **texto longo**: simula uma resposta longa para ver o resumo + painel.
- **node -v**: atalho que executa um comando real seguro como teste do bridge.

Você também pode marcar **"Modo mock"** para garantir que mesmo o botão
**Executar** não chame a Kiro de verdade.

---

## 🐶 Múltiplos MESPs

- Use o botão **+ Novo MESP** no painel ou **Novo MESP** no menu de contexto
  (clique direito sobre o pet).
- Cada novo pet:
  - tem `id` único,
  - posição própria,
  - tinta de cor diferente (paleta de `hue-rotate` em `PET_HUE_PALETTE`),
  - estado independente.
- A pixel art é preservada (`image-rendering: pixelated`).
- Para remover um pet específico use o menu de contexto → **Remover este MESP**
  (sempre permanece pelo menos 1 pet ativo).

---

## 🧠 Resumo automático

`src/services/summarize.ts` implementa uma versão inicial:

- Texto até 180 caracteres → usa o próprio texto.
- Acima disso → pega as primeiras frases até caber em 180 chars.
- Limpa quebras de linha em excesso.

A função foi escrita para ser facilmente substituída por um modelo de IA no
futuro: basta trocar a implementação de `summarize(text)` mantendo a assinatura.

---

## ⌨️ Comandos do package.json

| Script                  | O que faz                                                       |
| ----------------------- | --------------------------------------------------------------- |
| `npm run dev`           | Sobe Vite + Electron em modo dev (com hot reload).              |
| `npm run build`         | Gera `dist/` (renderer) e `dist-electron/` (main + preload).    |
| `npm run start`         | Abre o Electron usando o build atual.                           |
| `npm run preview`       | Preview estático do bundle do renderer.                         |
| `npm run typecheck`     | Roda apenas `tsc -b --noEmit`.                                  |
| `npm run package`       | Build + `electron-builder` para gerar instaladores.             |
| `npm run package:dir`   | Mesmo do anterior, mas só descompactado em `release/`.          |
| `npm run extract-sprites` | Copia os sprites do ZIP para `src/assets/sprites/mesp/`.      |

---

## 🔐 Segurança (Electron)

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: false` (para permitir o preload usar `ipcRenderer`)
- O renderer só conversa com o main via API exposta em `electron/preload.ts`
  (`window.mesp.runKiro`, `window.mesp.setIgnoreMouseEvents`, etc.).
- A janela usa `setIgnoreMouseEvents(true, { forward: true })` por padrão e o
  React reativa cliques apenas em cima dos elementos `.interactive` (pet,
  balão, painel, menu, controles).

---

## 🛠️ Solução de problemas

- **A janela aparece preta opaca:** alguns ambientes Linux não suportam janela
  transparente sem composição. Tente um WM com compositor (Mutter, KWin,
  Picom). No Windows e macOS funciona out-of-the-box.
- **Cliques não passam para o desktop:** mova o mouse para fora dos elementos
  do MESP. O pass-through é alternado dinamicamente conforme o cursor entra ou
  sai dos elementos `.interactive`.
- **`kiro` não é encontrado:** ajuste `KIRO_COMMAND` no `.env` ou ative o
  **Modo mock** no painel.
- **Sprites não aparecem:** rode `npm run extract-sprites`. Confirme que
  `src/assets/sprites/mesp/` contém pelo menos `mesp_frente_idle_01.png`.

---

## 📜 Licença

MIT — use, modifique e divirta-se com o MESP.
