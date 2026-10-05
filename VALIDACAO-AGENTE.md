# MESP como desenvolvedor de vários projetos — 5 de outubro de 2026

## Atualização: 50 melhorias e entrega independente

As [50 melhorias](MELHORIAS-50-DESENVOLVEDOR.md) foram implementadas. O agente
agora recebe inspeção e memória do projeto, entrega arquivos, passa por verificações
independentes e pode corrigir até duas vezes antes do resultado final.
As correções compartilham tempo, tokens e ferramentas. O chat aguarda outras tarefas
da mesma pasta e limita a três execuções autônomas simultâneas.

Passaram **15/15 etapas** de `test:complete`: unidades, lint, build, entrega no
Electron, agente nativo, acesso ao computador, roteamento, usabilidade, histórico,
configurações, 9Router instalado, Auto, desempenho, auditoria e projetos.
Após os ajustes finais de recuperação e detecção de lockfiles grandes, passaram
novamente **291 testes unitários**, lint, build e `test:developer` com todos os
diretórios XDG do runtime isolados.

O teste de entrega provocou uma falha real no teste Node, observou a correção do
arquivo pelo OpenCode nativo e aprovou a nova execução. Confirmou espera/cancelamento
de tarefa concorrente na mesma pasta, um único evento final, cancelamento do
processo de verificação, rascunho e relatório após reiniciar, copiar sem alterar
o clipboard do usuário e exportação do relatório. O cartão foi capturado e conferido
em 320 px, sem transbordamento horizontal.

A auditoria de prévia usou Chromium real em janela oculta: página correta e quebrada,
erro de console, imagem ausente, transbordamento em 320/390/1024 px, bloqueio de
pop-ups, cancelamento de carregamento lento e ausência de janelas órfãs.
O transporte de contexto foi verificado com mais de 100 mil caracteres UTF-8,
incluindo acentos e emoji, sem exceder a linha de comando do Windows.

Os testes de UI com agentes simulados agora isolam também a classificação de
intenção; a classificação e a execução reais são verificadas nas suítes próprias.
As simulações não comprovam autenticação. Os relatórios identificam explicitamente
verificações não executadas e inspeções limitadas.

Evidências locais ignoradas pelo Git: `qa/validation-1791210450573/results.json`
e `qa/final-developer-1791211078110/results.json`.

A aplicação real foi fechada normalmente, com árvore de processos identificada e
sem agentes em execução, e reaberta na versão compilada. O perfil recebeu cópia de
segurança antes da reabertura; projetos, histórico e configurações foram preservados.

**Verificação com conta real nesta versão:** o 9Router Auto e o OpenCode criaram
`index.html`, `script.js` e `style.css` a partir de um pedido pela interface, sem
seletor de repositório. A entrega independente aprovou a sintaxe, o carregamento
e 320/390/1024 px. No navegador, passaram adicionar, concluir, recarregar com
persistência, desmarcar e excluir. O botão de exclusão é um ícone com tooltip;
o teste aceita o título do controle além do texto visível. Não houve necessidade
de correção automática nessa tarefa. A captura opcional da janela oculta excedeu
cinco segundos; as verificações funcionais passaram. Evidência ignorada pelo Git:
`qa/todo-live-1791211277070/evidence.json`.

## Atualização: interpretação de intenção por modelo

A decisão principal agora usa uma consulta isolada ao 9Router Auto com pedido,
histórico limitado e indicação de projeto selecionado. Retorna somente a intenção,
o tipo de pasta necessário e a necessidade de prévia. Não recebe ferramentas,
arquivos do projeto ou credenciais. O Auto trata essa consulta como trabalho
leve, mantendo o modelo escolhido para a execução do MESP.

Pedidos indiretos e mistos podem executar: **O botão salvar parou**, **Dá para
colocar login com Google?**, **Como resolvo isso? Implemente a correção**.
Explicações explícitas continuam na conversa. O modelo avalia continuações com
o histórico. Novos entregáveis recebem pasta própria; correções de um projeto
ainda não localizado recebem o aviso de acesso antes de escolher a pasta.

O prazo máximo da interpretação é seis segundos; respostas inválidas, falhas
ou demora usam o detector local. Decisões válidas têm cache de 30 segundos,
considerando histórico e presença de pasta. Parar interrompe a interpretação
antes do envio ao agente. Plano e Assistido não são promovidos a Autônomo.
O estado de atividade permanece contínuo ao preparar a pasta e iniciar a tarefa.

Passaram **261 testes unitários**, lint, build, roteamento no Electron, usabilidade
e a todolist com OpenCode nativo, incluindo um pedido indireto. Os testes de
roteamento verificam decisões vindas do provedor simulado, respeito a explicações,
cancelamento antes da execução e preservação do rascunho. Credenciais continuam
somente no processo principal. A autenticação separada do painel do 9Router não
bloqueia o classificador quando a API anuncia suporte real ao Auto.

Com uma conta real, o modelo aprovou os oito casos da matriz, incluindo contexto
de continuação, criação de CSV, todolist e explicações sem alterações. As decisões
levaram aproximadamente **0,9 a 2,4 segundos nesta verificação**. O pedido indireto
**Gostaria de uma todolist que eu consiga abrir no navegador** criou HTML, CSS e
JavaScript pelo agente real. O navegador confirmou adicionar, concluir, desmarcar,
excluir, persistência ao recarregar e ajuste em 390 px. A captura opcional da
janela oculta ultrapassou o prazo; as verificações funcionais passaram.

## Correção anterior: executar comandos de criação

O pedido **crie uma todolist** caía na conversa rápida porque o detector
reconhecia apenas alguns tipos de entregáveis. A criação agora aceita outros
entregáveis; lista de tarefas sem formato especificado vira um aplicativo web
com prévia. TXT e Markdown explícitos continuam sendo arquivos. Tutoriais e
conteúdo pedido na conversa não exigem execução.

Nesta atualização passaram **254 testes unitários**, lint, build, a suíte de
roteamento e o novo teste de todolist no Electron. O novo teste usa OpenCode
instalado, provedor simulado e arquivos reais: verifica o pedido exato sem
seletor de pasta, o link, adicionar/concluir/desmarcar/excluir, persistência após
recarregar e largura pequena. Seu projeto Git isolado evita que snapshots do
OpenCode indexem o repositório inteiro do aplicativo durante a verificação.

O pedido exato também foi executado com **Auto e uma conta real do 9Router**.
O agente criou HTML, CSS e JavaScript; o navegador verificou adicionar, concluir,
desmarcar, excluir, persistência após recarregar e ausência de rolagem horizontal
em 390 px. A primeira página gerada excedia a largura; as instruções de CSS
foram reforçadas e a nova geração passou nas verificações. A captura opcional
da janela oculta ultrapassou o prazo; as verificações funcionais não dependem
dessa imagem. A repetição sobre os mesmos arquivos passou sem pedir nova geração.

## Resultado da revisão anterior: acesso ao computador

Todas as **14 verificações cobertas por `npm run test:complete` passaram** nesta
compilação, incluindo **252 testes unitários**, lint e build. Os testes usaram
perfis isolados e janelas ocultas. A auditoria aprovou 37 verificações de
interface; a suíte de vários projetos aprovou 14 verificações.

A execução final em sequência aprovou 13/14 na primeira tentativa. A abertura
de Configurações ultrapassou o prazo de 30 segundos do teste durante a partida
do servidor local; a repetição isolada passou. O teste agora reserva 60 segundos
para combinar a inicialização do 9Router com o carregamento da página.

| Verificação                              | Resultado                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Unitários, lint e build                  | Aprovados; 252 testes unitários                                                         |
| Acesso ao computador                     | Leitura, gravação e PowerShell em arquivos fora do projeto; Plano e Assistido aprovados |
| Agente nativo                            | Arquivos, comandos, prévia, fila, falha e cancelamento aprovados                        |
| Dois agentes nativos simultâneos         | Pastas distintas, arquivos reais e rascunho preservado                                  |
| Roteamento, usabilidade e histórico      | Aprovados                                                                               |
| Configurações, 9Router e Auto            | Aprovados                                                                               |
| Desempenho                               | Sem animação enquanto totalmente oculto; aprovado                                       |
| Auditoria de interface e vários projetos | Aprovados                                                                               |
| Conta real, navegador e POST persistido  | Aprovados                                                                               |

## Análise do fluxo

| Necessidade                  | Comportamento e evidência                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversar sem repositório    | Cumprimentos e perguntas seguem pelo modo Rápido, sem abrir seletor de pasta.                                                                                                                 |
| Trabalhar fora do projeto    | Caminhos absolutos, pastas pessoais, discos e comandos usam as permissões do usuário do Windows. Pedidos com localização externa usam ferramentas sem exigir repositório.                     |
| Pedir uma implementação      | Novos entregáveis recebem uma pasta própria; o agente cria arquivos e executa comandos. Correções de projetos existentes mantêm a escolha da pasta dentro da ilha.                            |
| Trabalhar em vários sistemas | Dois OpenCode nativos executaram simultaneamente em pastas distintas. Dez MESP foram verificados na interface, com títulos, estados, resultados e persistência.                               |
| Manter o contexto            | Históricos e sessões são separados por MESP. Trocas, recolhimento e promoção do resultado preservam a conversa selecionada e o rascunho.                                                      |
| Identificar o que terminou   | Títulos dinâmicos, bolinhas de estado e resultados não lidos permanecem visíveis na fila e em Meus MESP. Renomeações manuais são respeitadas.                                                 |
| Usar modelos e contas        | Todos os MESP usam 9Router. `/model`, catálogo e configurações funcionam na ilha; mudanças de modelo ficam bloqueadas durante tarefas ativas.                                                 |
| Recuperar uma falha          | Resposta sem ferramentas não é apresentada como implementação concluída. Falhas pausam a fila, preservando tarefas e rascunho após reiniciar.                                                 |
| Interromper com segurança    | Cada execução nativa no Windows tem seu próprio Job Object. O teste também criou um filho destacado cujo pai já havia saído e confirmou seu encerramento sem afetar um processo independente. |
| Abrir o resultado            | HTML estático e backend Node com `.mesp-preview.json` recebem prévia verificada. POSTs são encaminhados ao backend real.                                                                      |
| Usar uma tela pequena        | Cabeçalho compacto, controles acessíveis e fila com rolagem própria. Auditoria cobre larguras de 320 a 1366 px.                                                                               |

A correção principal desta revisão foi encerrar a tarefa inteira no Windows,
incluindo processos que deixaram de aparecer na árvore comum após a saída de
seu terminal. O sistema usa os [Job Objects do Windows](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).
O teste verificou cancelamento e conclusão, argumentos com espaços e aspas,
saída UTF-8, processos destacados e preservação de um processo independente.

Também foram corrigidos a criação de tarefas além de sites, a pausa da fila após
falha, a espera pelo encerramento da prévia, o espaço do cabeçalho em telas
estreitas e um aviso de execução que podia permanecer depois da conclusão.

## Acesso ao computador

Foram removidos o bloqueio de diretórios externos no Plano e no Assistido e a
instrução que limitava o Autônomo ao projeto. O agente recebe o diretório inicial,
o perfil e os caminhos reais de Desktop, Documentos e Downloads, para localizar
arquivos inclusive no OneDrive. Busca direcionada evita varrer discos inteiros
sem necessidade. O acesso não altera as permissões ou configurações globais de
Codex e Claude.

`test:computer` executou o OpenCode instalado com um provedor simulado, leu um
arquivo com espaços no nome em uma pasta temporária externa, escreveu outro e
executou PowerShell sobre esses arquivos. A resposta da ferramenta continha o
texto real lido; o arquivo escrito e o resultado do comando foram conferidos no
disco. Nenhum seletor de repositório foi aberto. Plano leu o arquivo e teve a
tentativa de escrita bloqueada. Assistido leu e manteve a gravação pendente até
uma aprovação específica. O perfil permaneceu isolado e a pasta temporária foi
removida ao terminar.

A cópia tem uma ferramenta local do MESP, conectada ao agente pelo
[MCP suportado pelo OpenCode](https://opencode.ai/docs/mcp-servers/).
Ela preserva os bytes e compara SHA-256 da origem e do destino. Os testes
incluem dados binários, BOM, CRLF e texto sem quebra final, além de preservar
destinos existentes por padrão. Plano bloqueia a ferramenta; Assistido aguarda
aprovação. A ferramenta não depende de cmdlets opcionais do PowerShell.

O teste com conta real usando **Auto** leu um arquivo temporário externo,
copiou o conteúdo exato e executou PowerShell para conferir os bytes. A primeira
verificação com GPT-4o mini havia reconstruído o texto incluindo números de
linha ou uma quebra final; esse resultado foi rejeitado. A ferramenta de cópia
e as instruções do agente foram ajustadas, mantendo a comparação exata no teste.

Também foi corrigida a perda do registro do modelo Auto no agente nativo quando
o painel do 9Router exigia autenticação e a API de modelos permanecia acessível.
O registro agora consulta a capacidade real do servidor. O teste reproduz o
painel bloqueado e verifica que Auto chega à API e executa ferramentas reais.

O acesso é a arquivos, programas e comandos, com as permissões do usuário que
executa o MESP. Não concede administração automática nem acrescenta ferramentas
de visão ou clique em interfaces gráficas. O gerenciamento de processos da
própria tarefa continua funcionando.

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
