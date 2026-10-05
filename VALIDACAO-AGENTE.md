# MESP como desenvolvedor de vários projetos — 5 de outubro de 2026

## Resultado da revisão

Todas as **13 verificações de `npm run test:complete` passaram** nesta
compilação, incluindo **248 testes unitários**, lint e build. Os testes usaram
perfis isolados e janelas ocultas. A auditoria aprovou 37 verificações de
interface; a suíte de vários projetos aprovou 14 verificações.

| Verificação | Resultado |
| --- | --- |
| Unitários, lint e build | Aprovados; 248 testes unitários |
| Agente nativo | Arquivos, comandos, prévia, fila, falha e cancelamento aprovados |
| Dois agentes nativos simultâneos | Pastas distintas, arquivos reais e rascunho preservado |
| Roteamento, usabilidade e histórico | Aprovados |
| Configurações, 9Router e Auto | Aprovados |
| Desempenho | Sem animação enquanto totalmente oculto; aprovado |
| Auditoria de interface e vários projetos | Aprovados |
| Conta real, navegador e POST persistido | Aprovados |

## Análise do fluxo

| Necessidade | Comportamento e evidência |
| --- | --- |
| Conversar sem repositório | Cumprimentos e perguntas seguem pelo modo Rápido, sem abrir seletor de pasta. |
| Pedir uma implementação | Novos entregáveis recebem uma pasta própria; o agente cria arquivos e executa comandos. Correções de projetos existentes mantêm a escolha da pasta dentro da ilha. |
| Trabalhar em vários sistemas | Dois OpenCode nativos executaram simultaneamente em pastas distintas. Dez MESP foram verificados na interface, com títulos, estados, resultados e persistência. |
| Manter o contexto | Históricos e sessões são separados por MESP. Trocas, recolhimento e promoção do resultado preservam a conversa selecionada e o rascunho. |
| Identificar o que terminou | Títulos dinâmicos, bolinhas de estado e resultados não lidos permanecem visíveis na fila e em Meus MESP. Renomeações manuais são respeitadas. |
| Usar modelos e contas | Todos os MESP usam 9Router. `/model`, catálogo e configurações funcionam na ilha; mudanças de modelo ficam bloqueadas durante tarefas ativas. |
| Recuperar uma falha | Resposta sem ferramentas não é apresentada como implementação concluída. Falhas pausam a fila, preservando tarefas e rascunho após reiniciar. |
| Interromper com segurança | Cada execução nativa no Windows tem seu próprio Job Object. O teste também criou um filho destacado cujo pai já havia saído e confirmou seu encerramento sem afetar um processo independente. |
| Abrir o resultado | HTML estático e backend Node com `.mesp-preview.json` recebem prévia verificada. POSTs são encaminhados ao backend real. |
| Usar uma tela pequena | Cabeçalho compacto, controles acessíveis e fila com rolagem própria. Auditoria cobre larguras de 320 a 1366 px. |

A correção principal desta revisão foi encerrar a tarefa inteira no Windows,
incluindo processos que deixaram de aparecer na árvore comum após a saída de
seu terminal. O sistema usa os [Job Objects do Windows](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).
O teste verificou cancelamento e conclusão, argumentos com espaços e aspas,
saída UTF-8, processos destacados e preservação de um processo independente.

Também foram corrigidos a criação de tarefas além de sites, a pausa da fila após
falha, a espera pelo encerramento da prévia, o espaço do cabeçalho em telas
estreitas e um aviso de execução que podia permanecer depois da conclusão.

## 9Router real e conta real

Em 5 de outubro, o runtime instalado respondeu com **25 modelos e oito contas
cadastradas**, usando o armazenamento nativo do 9Router. O painel informou
consumo disponível e suporte ao Auto. Cadastro e metadados de saúde não provam
que toda conta possa executar qualquer modelo.

Uma conta GitHub existente, com GPT-4o mini, criou HTML, backend Node e a
configuração de prévia, executou `node --check` e concluiu a tarefa. O navegador
preencheu o campo Nome e enviou um POST real; o backend respondeu 201 e gravou
**Teste MESP** em `contatos.json`. O teste confirmou o conteúdo persistido,
ausência de erros JavaScript e encaixe em 390 px. A prévia também foi retomada
após fechar e reabrir o aplicativo de teste.

A conta Codex cadastrada sinalizou falha de autenticação: exige novo login no
9Router e é ignorada pelo Auto enquanto estiver nessa condição. As três contas
Gemini CLI não forneceram dados de cota; a interface não inventa créditos ou
horários de reset para elas. Antigravity, GitHub e Kiro forneceram metadados de
cota. Apenas a execução GitHub acima comprova uma resposta autenticada real.

## O que os testes simulados comprovam

O servidor 9Router instalado foi iniciado com perfil isolado e suas páginas e
formulários nativos foram utilizados na única janela flutuante. O teste de Auto
usou contas e APIs simuladas: verificou complexidade, proximidade do reset,
exclusão de contas esgotadas, fallback, respostas vazias, timeout, cancelamento,
distribuição simultânea e registro do consumo por conta. O roteamento aquecido
ficou abaixo de 100 ms nesse teste; isso não mede a latência de um provedor real.

## Reproduzir e consultar

Execute `npm run test:complete`. As 13 verificações incluem unitários, lint,
build, agente nativo, roteamento, usabilidade, histórico, configurações, 9Router,
Auto, desempenho, auditoria e vários projetos. Perfis, logs, capturas e dados
privados dos testes ficam em `qa/`, fora do Git.

Rodada desta compilação: `qa/validation-1791200134267/results.json`.
Teste real de backend: `qa/agent-backend-live-1791200222010`.

Os links de prévia são locais e dependem do MESP aberto. Publicação na internet,
bancos externos e outros serviços precisam de configuração correspondente.
A validação cobre os fluxos descritos; não garante toda tarefa futura, toda
conta ou todo projeto arbitrário sem intervenção.
