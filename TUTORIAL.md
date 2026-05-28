# MESP Pet — Tutorial de instalação (Windows)

Tutorial passo a passo pra rodar o MESP Pet num PC novo, do zero até ver o pet
na tela conectado ao **Claude Code**.

Tempo estimado: ~10 min (a maior parte é download).

---

## 1. Pré-requisitos

Você precisa de **3 coisas** instaladas antes de tocar no projeto:

### 1.1 — Node.js 20 ou superior

1. Baixe o instalador LTS em https://nodejs.org/
2. Rode o `.msi`, **next → next → next** (deixe "Add to PATH" marcado).
3. Abra um **PowerShell novo** e confirme:

   ```powershell
   node --version
   npm --version
   ```

   Esperado: `v20.x` (ou maior) e `10.x` (ou maior).

### 1.2 — Claude Code CLI

Instale globalmente via npm:

```powershell
npm install -g @anthropic-ai/claude-code
```

Confirme:

```powershell
claude --version
```

Se der "comando não encontrado", feche e reabra o PowerShell.

### 1.3 — Autenticar o Claude

Rode uma vez:

```powershell
claude
```

Ele vai te pedir login (abre o navegador) ou uma API key. Faça o login uma vez,
depois pode digitar `/exit` pra sair. O token fica salvo no perfil do usuário, então
o MESP vai usar essa autenticação automaticamente.

---

## 2. Extrair o projeto

1. Salve o arquivo `mesp-pet.zip` em algum lugar (ex.: `C:\Users\<seu-user>\Documents\`).
2. Botão direito → **Extrair tudo…** → escolha o local. Vai criar uma pasta
   `mesp-pet` com tudo dentro.
3. Abra um PowerShell **dentro** dessa pasta (Shift + botão direito na pasta →
   "Abrir janela do PowerShell aqui" — ou `cd "C:\caminho\até\mesp-pet"`).

---

## 3. Instalar dependências

Na raiz do projeto (onde está o `package.json`):

```powershell
npm install
```

Demora ~1-2 min. No final aparece algo como `added 445 packages`. Se ver
`found 0 vulnerabilities`, está OK.

> Se der erro relacionado a `node-pty`/build, o pacote
> `@homebridge/node-pty-prebuilt-multiarch` deveria entregar binário pronto. Em
> último caso, instale o **Visual Studio Build Tools** (workload "Desktop
> development with C++") e rode `npm rebuild` — mas raramente é necessário.

---

## 4. Build de produção

```powershell
npm run build
```

Compila TypeScript + Vite. Deve terminar em poucos segundos. Cria as pastas
`dist/` e `dist-electron/`.

---

## 5. Verificar o `.env`

O ZIP já vem com um `.env` configurado para o Claude Code:

```
KIRO_COMMAND=claude
KIRO_DEFAULT_ARGS=
KIRO_TASK_PREFIX=
```

Se quiser usar outra CLI (Aider, Gemini, Codex etc.), edite o `KIRO_COMMAND`
ou troque pelo painel ⚙ dentro do app depois.

---

## 6. Rodar

```powershell
npm start
```

Em ~2 segundos um pet em pixel art aparece na tela, numa janela transparente
sempre no topo.

---

## 7. Como usar

| Ação | Resultado |
|---|---|
| **Clique** no pet | Abre/fecha o terminal com o `claude` rodando |
| **Arrastar** | Move o pet pelo desktop |
| **Duplo clique** | Pulinho de alegria |
| **Clique e segurar** | Acariciar — coraçõezinhos sobem |
| **4+ cliques rápidos** | Susto — pet treme e foge |
| **Botão direito no pet** | Menu de contexto |

### Menu de contexto (botão direito no pet)

- **✨ Novo MESP** — adiciona outro pet (até 10 simultâneos)
- **🎾 Dropar bolinha** — pet persegue
- **💤 Dormir** / **☀️ Acordar**
- **🪑 Sentar**
- **📋 Abrir painel** — força o terminal a aparecer
- **📁 Pasta de trabalho…** — escolhe em qual projeto o `claude` vai abrir
  (cada pet pode ter pasta diferente)
- **🟢 Iniciar com o sistema** — abre automaticamente no boot
- **🔄 Resetar pets** — apaga estado salvo e recarrega
- **🗑️ Remover este MESP**
- **⏻ Fechar app**

### Trocar a pasta de trabalho

Esse é o ponto importante: por padrão o `claude` abre no diretório onde o app
foi iniciado. Pra trabalhar num projeto específico:

1. Botão direito no pet → **📁 Pasta de trabalho…**
2. Escolha a pasta do projeto no diálogo do Windows
3. O terminal reinicia automaticamente já com o `claude` na pasta certa
4. Da próxima vez, o menu mostra **"📁 Pasta: …/parent/projeto"** — o caminho
   fica salvo por pet (localStorage)

Você pode ter **MESP-1 no projeto A** e **MESP-2 no projeto B**, cada um com
seu `claude` rodando em paralelo.

---

## 8. Inicializar com o Windows (opcional)

Botão direito no pet → **⚪ Iniciar com o sistema**. Vira **🟢** e o app abre
no próximo login. Pra desligar, clica de novo.

---

## 9. Atualizar depois

Se você editar código:

```powershell
npm run build
npm start
```

Se quiser desenvolvimento com HMR (hot-reload):

```powershell
npm run dev
```

---

## 10. Empacotar instalador (.exe)

Se quiser gerar um `.exe` distribuível em vez de rodar via `npm start`:

```powershell
npm run package
```

O instalador NSIS sai em `release/`. Aí dá pra criar atalhos com diferentes
"Iniciar em:" pra cada projeto (alternativa ao item de menu "Pasta de trabalho").

> O binário **não é assinado**. O Windows SmartScreen vai avisar — em "Mais
> informações" → "Executar mesmo assim".

---

## Problemas comuns

**Terminal mostra "desconectado"**
→ O comando `claude` não está na PATH. Confirme `claude --version` no
PowerShell. Se falhar, refaça o passo 1.2.

**Terminal pede login toda vez**
→ Faça `claude` no PowerShell uma vez (passo 1.3) e complete o login. O token
fica em `%USERPROFILE%\.claude\` e é reutilizado.

**Pet não aparece**
→ Pode estar salvo numa posição fora da tela (ex.: trocou de monitor). Clique
direito em qualquer lugar onde havia pet → **Resetar pets**. Se não houver pet
visível, apague `%APPDATA%\mesp-pet\` e reinicie.

**Janela não fica transparente / fundo preto**
→ Acontece em algumas placas com aceleração desligada. Verifique se as
configurações de transparência do Windows estão ativas (Configurações →
Personalização → Cores → "Efeitos de transparência").

**`npm install` falha em `node-pty`**
→ Instale Visual Studio Build Tools (workload C++) e rode `npm rebuild`. Veja
nota no passo 3.

---

## Resumo (TL;DR)

```powershell
# Uma vez na vida:
# 1. instalar Node em https://nodejs.org
npm install -g @anthropic-ai/claude-code
claude    # faz login, depois /exit

# No projeto:
cd C:\caminho\para\mesp-pet
npm install
npm run build
npm start
```

Pronto. Clica no pet, escolhe a pasta pelo menu de contexto, conversa com o
Claude. 🐾
