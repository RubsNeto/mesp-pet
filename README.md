# MESP Top Dock

Aplicativo desktop com personagens MESP em uma ilha preta no topo da tela,
inspirada no Coucou. Cada personagem acompanha um projeto ou tarefa com Codex,
Claude Code ou MESP Code conectado ao 9Router.

Esta é a versão atual do repositório. O guia de uso está em
[LEIA-ME-DOCK.md](LEIA-ME-DOCK.md).

## Recursos

- Criação instantânea pelo **+**, com pasta e agente herdados do MESP selecionado.
- Até dez personagens com cores próprias, formato clássico e olho único.
- Personalização dentro da ilha; acessórios aparecem apenas quando escolhidos.
- Títulos automáticos e acesso ao resultado quando uma tarefa termina.
- Conversas e rascunhos separados por MESP, preservados ao recolher e reiniciar.
- Campo único no MESP Code com envio, cancelamento e fila de tarefas.
- Configurações e painel do 9Router na mesma janela flutuante.
- Modelos por MESP, consumo geral e por conta, cotas e resets quando informados.
- Modelo **Auto** que prioriza contas elegíveis com reset mais próximo.
- Expansão com mola, carinho, compressão ao clicar e movimento reduzido.
- Proteção ao sair com agentes ou verificações ativos.

O MESP Code oferece os modos Rápido, Plano, Assistido e Autônomo. O login dos
provedores acontece no fluxo real do 9Router. O estado de autenticação precisa
ser verificado; modelos de catálogo podem depender do plano da conta.

## Executar no Windows

Requisitos: Node.js 22 e npm. Instale as dependências e compile:

```powershell
npm ci
npm run build
.\Abrir-MESP.ps1
```

Para desenvolvimento, use `npm run dev`. O perfil independente fica em
`%APPDATA%\MESP Top Dock`; dados de contas permanecem no processo principal.

## Verificação

```powershell
npm test
npm run lint
npm run build
npm run test:audit
```

Playwright é uma dependência de desenvolvimento. Os testes Electron abrem
janelas ocultas e usam perfis separados, sem acessar as contas reais do usuário.
Há verificações adicionais em `test:dock`, `test:usability`, `test:history`,
`test:router` e `test:router:auto`.

A revisão de 1º de outubro de 2026 passou em 200 testes unitários e 35
verificações de interação, além dos testes de histórico, usabilidade e roteador.
Veja [AUDITORIA-DOCK-20261001.md](AUDITORIA-DOCK-20261001.md).

## Licenças

Consulte [LICENSE](LICENSE), a licença preservada em `src/coucou/LICENSE` e
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
