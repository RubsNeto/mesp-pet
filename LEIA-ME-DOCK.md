# MESP Top Dock

## Mais espaço para conversar

Ao abrir o chat, a ilha tem até 760 px de largura. A conversa livre abre com
520 px de altura no desktop; projetos e vários MESP têm mais espaço, sempre
limitado ao tamanho da tela. O título fica ao lado do personagem, com o estado
logo abaixo, sem o nome genérico nem a linha de nome fixo. O cabeçalho ocupa
48 px; em telas estreitas com vários MESP, usa 82 px para acomodar a fila.
Os MESP menores ficam em uma única fila horizontal. A bolinha de cada personagem
muda de cor conforme o estado, sem ícone de check. Em telas estreitas, use a
roda do mouse, o trackpad ou Tab para alcançar os demais personagens. Ao selecionar
um MESP, ele entra na área visível da fila. Os atalhos de projetos usam cartões
compactos com nomes e estados. A seta de recolher fica no canto superior direito
e aponta para cima. Conversas, aparências, rascunhos e sessões são preservados.

## Conexões e desempenho — 2 de outubro de 2026

Todos os MESP usam o **9Router**. Personagens antigos vinculados a Codex ou
Claude passam para MESP Code ao reabrir, mantendo pasta, aparência, rascunho,
resultado e histórico. O aplicativo não encerra tarefas em andamento para
efetuar essa migração; uma sessão salva como ativa é identificada como interrompida
somente depois que o aplicativo tiver sido encerrado.

O layout compacto anterior foi restaurado: uma área de conversa e um campo de
mensagem. Digite **/model**, **/models** ou **/modelos** e pressione **Enter**
para abrir a aba de modelos nas Configurações da própria ilha, sem um segundo
painel sobre a conversa. A busca e os filtros de provedores continuam disponíveis;
o modelo atual fica marcado, e **Auto** aparece no início.
A lista usa os modelos confirmados de cada conta, sem anunciar modelos de contas
expiradas ou apenas presentes no catálogo geral.
A seleção permanece individual por MESP. Novos
personagens herdam o modelo selecionado. **Auto** escolhe conta e modelo a cada
pedido, priorizando o reset mais próximo e pulando contas esgotadas ou inválidas.
O 9Router mantém o histórico da requisição ao tentar outra conta. Nenhuma cota
disponível significa que o pedido precisará aguardar ou usar outra conta.

Respostas em **Auto** mostram **Auto · nome do modelo** em um detalhe pequeno
acima do texto. O nome vem da requisição real do 9Router, inclusive em projetos;
ele fica salvo junto da mensagem e não muda ao trocar de modelo. Se um roteador
externo não informar o modelo utilizado, o aplicativo não inventa esse detalhe.

A troca de modelo não limpa mensagens nem a sessão do projeto. Conversas livres
transferem seu contexto ao abrir uma pasta. O contexto enviado é limitado a 40
mensagens e 48 mil caracteres, com prioridade para o objetivo inicial e as
mensagens recentes. O limite da janela de contexto do modelo continua se aplicando.

Ao digitar **/**, a lista de comandos aparece acima do campo. Continue digitando
para buscar; clique ou use **↑**, **↓**, **Tab** e **Enter** para inserir o comando.
Pressione **Enter** novamente para executá-lo. **Esc** fecha primeiro essa lista.
**/model** abre a aba de modelos com **Enter**. Os demais comandos completos
também são executados diretamente com **Enter**.
Estão disponíveis modelos, conexões, consumo, cotas, abertura de projeto, novo
MESP, lista de projetos, personalização, ajuda e recolhimento.

O botão circular de enviar vira um quadrado de **Parar** enquanto há uma resposta,
tarefa ou verificação em andamento. Ele continua ativo com o campo vazio;
interromper conserva o rascunho. Em projetos, **Enter** ainda adiciona outra tarefa
à fila, e o atalho **Adicionar à fila** aparece quando há texto digitado.

As Configurações têm as abas **Modelos**, **Contas** e **Consumo**. Em Contas,
os provedores aparecem com ícones e nomes, e cada conta mostra seu estado e reset
quando informado. Clique no consumo da conta para ver seus dados; escolha
**Todas as contas** para o total geral. A busca de modelos e as abas permanecem
acessíveis durante a rolagem. A página,
a busca e os campos do 9Router são preservados ao recolher e reabrir a ilha,
inclusive com Ctrl+K. Com o painel expandido, Ctrl+K continua voltando ao chat.
Formulários têm rolagem própria e se ajustam à largura e altura disponíveis.

As animações usam um relógio compartilhado; ícones repetidos e personagens fora
da área visível ficam parados. A janela oculta não mantém animações de personagens.
O teste de área clicável e o painel de conexões medem o layout apenas quando muda.
O salvamento de rascunhos agrupa digitação e grava imediatamente ao fechar.

Verificações: `npm run test:routing`, `npm run test:router`,
`npm run test:settings`,
`npm run test:router:auto`, `npm run test:performance`, `npm run test:audit`,
`npm run test:projects`, `npm run test:history` e `npm run test:usability`.
Os testes usam perfis isolados; contas simuladas não comprovam login nas contas reais.

## Vários sistemas em paralelo

Ao expandir a ilha, os personagens mostram o título da tarefa, o sistema e a
situação. Clique para trocar de conversa; cada MESP conserva seu próprio
rascunho. **Meus MESP** abre a busca e os filtros **Todos**, **Em andamento**,
**Atenção** e **Concluídos**. A atenção reúne pedidos de intervenção, erros e
sessões que foram interrompidas ao fechar o aplicativo.

O nome da tarefa muda conforme o novo objetivo, usando o contexto dos últimos
pedidos na consulta isolada de título. **Sim**, **continue** e outras confirmações
mantêm o objetivo anterior. O nome do sistema continua visível. Um título editado
manualmente permanece fixo; clique no título e use o ícone **Usar título automático**
para liberar os nomes automáticos para os próximos pedidos.

Tarefas que terminam em segundo plano promovem o personagem sem trocar a
conversa, o foco ou o rascunho atual. O contador **novos** dá acesso aos resultados
pendentes, incluindo quando vários MESP terminam. Ler uma conversa concluída
marca somente aquele resultado como visto. Os resultados e estados de atenção
ficam salvos ao reiniciar; uma sessão encerrada aparece como interrompida,
sem afirmar que o agente continua executando.

Também é possível pedir **O que terminou?**, **Quem está trabalhando?**,
**Projetos em andamento** e **Projetos com erro** para abrir os filtros, sem
chamar a IA nem escolher pastas. A lista tem rolagem dentro da ilha, com busca
e filtros acessíveis durante a rolagem. As animações respeitam movimento reduzido.

Verificação desta revisão: `npm run test:projects` usa o Electron real com um
perfil isolado e agentes simulados para verificar dez sistemas, tarefas em
paralelo, promoção, rascunhos, títulos, resultados, reinício e telas estreitas.
Esses testes não comprovam autenticação nas contas pessoais dos provedores.

## Revisão de uso de 1º de outubro de 2026

Você pode conversar sem escolher uma pasta: cumprimentos, dúvidas, explicações,
planejamento e conteúdo usam o modelo escolhido no MESP pelo 9Router, com
as contas conectadas nesse painel. Essas conversas não acessam arquivos nem
executam ações externas.
Se um pedido precisar de arquivos, o MESP explica antes e oferece **Escolher
projeto e continuar**. O seletor só abre ao clicar nessa opção ou pedir
**Abrir projeto**. Cancelar conserva a conversa e o rascunho. **Parar** interrompe
a resposta; recolher ou trocar de MESP deixa a conversa continuar.
Saudações simples, como **oi**, **olá** e **bom dia**, recebem uma resposta
imediata do próprio MESP, sem login, chamada à IA ou seleção de pasta. Isso vale
também quando há uma pasta salva ou o MESP Code está em modo Autônomo. Saudações
com uma tarefa, como **oi, corrija o erro**, continuam indo ao agente escolhido.

A personalização agora fica dentro da ilha: **Personalizar MESP → Cores ou
Acessórios → Salvar neste MESP**. Cancelar conserva a aparência anterior. O
formato clássico e o olho único aparecem tanto na prévia quanto no resultado.
Cada personagem mantém sua aparência, e o aplicativo retoma o MESP selecionado
quando é reaberto.

O MESP Code usa um único campo de conversa, com o mesmo rascunho salvo por MESP.
As sugestões completam esse campo sem apagar o texto existente. Durante uma
tarefa, **Parar** interrompe a execução e **Adicionar à fila** prepara a próxima.
Uma tarefa da fila começar não apaga o rascunho que você estiver escrevendo.
Os comandos locais, como **Personalizar MESP**, continuam funcionando nesse campo.

**Esc** fecha primeiro a lista, a personalização ou um menu aberto; depois pode
recolher a ilha. Com o painel aberto, **Esc** recolhe e um segundo **Esc** oculta
o MESP imediatamente, sem esperar os três segundos. **Ctrl+K** volta ao campo de conversa. Há confirmação dentro da
ilha ao tentar sair com agentes ou verificações ativos, incluindo pelo tray e
pelo fechamento da janela. Recolher mantém as tarefas em andamento.

A auditoria, os resultados e as limitações estão em **AUDITORIA-DOCK-20261001.md**.

Versão local do MESP com a ilha superior do Coucou: preto, cartões discretos,
expansão com mola, personagem sem contorno colorido e conversa sem barra lateral.

Abra pelo atalho **MESP Top Dock** ou pelo arquivo `Abrir-MESP.ps1`.
Clique no personagem para conversar. Para recolher, use a seta para baixo.
Ao recolher, o MESP se oculta automaticamente em três segundos. Passe o mouse
no topo da tela ou use **Ctrl+K** para acessá-lo novamente.
As sessões continuam abertas ao recolher ou trocar de projeto.

Use **+** para criar e mostrar um MESP imediatamente, sem formulário. Ele usa
a pasta e o modelo do MESP atual, sempre pelo 9Router. Se não houver uma pasta aberta, peça **Abrir projeto**.
A IA dá um título à tarefa automaticamente depois do primeiro pedido, usando
o 9Router em uma consulta curta, separada da sessão
de programação. A criação e a tarefa não esperam pela geração do nome. Se a
IA estiver indisponível, o pedido serve como título provisório. Você também
pode editar o título do chat manualmente se desejar.
Cada novo MESP recebe uma cor aleatória própria, salva para continuar igual
ao reabrir. O MESP original mantém seu azul clássico como base para os demais.
O formato clássico e o olho único permanecem iguais. Ele nasce sem
acessórios ou efeitos decorativos; itens são opcionais na personalização, e são
preservados depois de salvar. As cores evitam repetir as dos MESP já abertos.
Um MESP principal fica à esquerda e os demais ficam pequenos à direita.
Passe o mouse sobre o personagem para fazer carinho: uma mão o acaricia e ele fecha o olho.
Ao clicar, ele se comprime e volta ao normal com a animação de mola do Coucou.

MESP Code avisa a conclusão por eventos da própria sessão. O MESP
concluído vira o principal, sem substituir o chat ou o rascunho que você está usando.
Clique nele ou em **Ver resultado** para ler a resposta. Chat é o modo padrão;
**Terminal** mantém acesso à execução e aos eventos do projeto.
Na aba **Configurações**, conecte contas do Codex, Claude Code, Gemini e outros
provedores pelo painel do 9Router. Ao fechar o painel, as conexões e os modelos
são atualizados. Escolha um modelo e clique em **Usar neste MESP** para enviar
os pedidos desse projeto pelo 9Router. A troca fica salva por MESP e é bloqueada
durante uma tarefa. **Configurar ferramentas** abre a configuração nativa de
CLIs do 9Router; os atalhos não alteram o login global dos agentes sozinhos.
Os hooks ficam no perfil deste aplicativo e não alteram configurações globais dos agentes.

O painel real do 9Router fica dentro da ilha flutuante, na mesma janela do MESP,
com fundo preto, cartões neutros e controles compactos. **Gerenciar contas**,
**Conectar** e **Configurar ferramentas** abrem a área correspondente na ilha.
O seletor de seção dá acesso a provedores, cotas, consumo, ferramentas, combos,
chaves, proxies, preferências e ajustes avançados. **Visão geral** volta à escolha
de modelo e ao resumo do consumo e atualiza os dados das contas.
Os formulários, modais e tabelas se ajustam à largura disponível, com rolagem
dentro do painel. Ao recolher ou mudar para o chat, a página do 9Router fica oculta
e mantém os campos preenchidos. A ilha permanece aberta enquanto você edita as
configurações; ainda é possível recolhê-la manualmente. A expansão usa a mola do
MESP e respeita a preferência de movimento reduzido. O login externo dos provedores
mantém o fluxo de autenticação original do 9Router.
As listas de provedores e ferramentas mostram somente o ícone e o nome abaixo,
em uma grade compacta: oito colunas na largura normal e quatro em telas estreitas.
Os provedores adicionais aparecem automaticamente. Clique em um ícone para
acessar suas contas, estados e ajustes; o nome completo também aparece ao passar
o mouse. Os atalhos para criar endpoints e testar conexões continuam na grade.
A lupa ou **Ctrl+F** busca pelo nome dos provedores e ferramentas, sem diminuir
a altura da grade. **Esc** limpa e fecha a busca antes de recolher a ilha.
Se nada combinar, o painel informa isso e permite limpar a busca.
**Ctrl+K** volta ao chat e foca o campo de mensagem, inclusive dentro do 9Router.
Os rascunhos de cada MESP são salvos automaticamente no perfil local e
restaurados depois de reabrir o aplicativo, sem enviar o texto ao agente.
O campo de conversa aceita pedidos com várias linhas e cresce até cinco linhas
antes de rolar. **Enter** envia e **Shift+Enter** adiciona uma linha; colar código
preserva as quebras de linha. Peça **Ajuda** ou clique em **O que posso pedir?**
para ver exemplos de comandos. Os exemplos clicáveis mantêm seu rascunho.
Também é possível pedir **Modelos**, **Gerenciar contas**, **Conectar Codex**,
**Ver consumo**, **Ver cotas** e **Configurar ferramentas** para abrir esses
ajustes na mesma ilha, sem encaminhar esses comandos ao agente.
**Abrir MESP nome da tarefa** encontra o personagem pelo título que aparece no
chat. Se houver mais de um resultado, a lista é aberta para você escolher.

As conversas livres e os históricos antigos também são salvos por MESP.
Ao reabrir, o histórico permanece e uma indicação separa a conversa
anterior da nova sessão. Reabrir o aplicativo não envia uma tarefa automaticamente.
O histórico mantém as 100 mensagens mais recentes, com limite de tamanho por MESP.
O MESP Code mantém seu histórico próprio. Use o ícone **Copiar resposta** abaixo
das respostas ou **Copiar código** no bloco de código. O ícone confirma a cópia.
Ao ler mensagens antigas, **Ir para o fim** volta à resposta mais recente;
**Novas mensagens** avisa quando chegou texto enquanto você estava lendo.

Em **Configurações**, busque modelos entre todas as contas habilitadas. Modelos
consultados na conta são identificados; quando o provedor só oferece um catálogo,
a disponibilidade é confirmada ao usar. Contas com autenticação expirada mostram
**Reconectar** e ficam fora do Auto. O login continua no painel nativo do 9Router.

Escolha **Auto** para deixar o MESP escolher o modelo e a conta a cada pedido.
Uma classificação local, sem consulta adicional à IA, distingue perguntas simples,
programação comum e pedidos complexos. Modelos leves atendem perguntas simples;
modelos mais capazes têm prioridade em investigação, arquitetura, segurança e
refatorações. Confirmações como “continue” conservam a complexidade da tarefa anterior.
Se não houver o modelo ideal, o Auto tenta uma alternativa disponível.

Entre os modelos adequados, o Auto considera a cota disponível e deixa uma margem
maior para tarefas complexas. Entre contas com margem suficiente, prioriza o reset
mais próximo. Pedidos simultâneos são distribuídos entre contas adequadas para
evitar sobrecarregar uma só. A capacidade usa a menor cota aplicável ao modelo;
saldos e percentuais ausentes permanecem desconhecidos. Créditos de provedores
diferentes não são convertidos artificialmente em dinheiro.

O Auto ignora contas desativadas, esgotadas ou bloqueadas. Falhas de autenticação,
limite, conexão e respostas vazias antes do início da resposta permitem uma nova
tentativa com o mesmo contexto. Um intervalo de espera, conservado ao reiniciar,
impede repetir uma conta ou modelo que acabou de falhar. Esse cache guarda somente
identificadores de contas/modelos e o término da espera, sem prompts ou credenciais.
O roteamento tem limites de espera e tentativas;
uma resposta em andamento permanece na mesma conta e cancelar não reenvia a tarefa.
O histórico de consumo não precisa ser carregado para responder: contas, modelos
e cotas compartilham um cache curto, atualizado ao passar um reset.

Perguntas curtas como “O que é uma API?” e “Qual é a diferença entre React e Vue?”
usam modelos leves, mesmo mencionando programação. Pedidos para executar, corrigir
ou investigar continuam usando a categoria apropriada. Entre modelos leves na
mesma condição de cota/reset, variantes rápidas sem raciocínio prolongado têm
prioridade. O histórico continua sendo enviado normalmente.

O roteador de perfis locais existentes é preparado em segundo plano ao abrir o
MESP. Depois da primeira consulta, modelos e cotas recentes não bloqueiam o envio
enquanto se atualizam; o reaproveitamento é limitado a cinco minutos. Um reset
passado, dados mais antigos e a atualização manual exigem nova consulta. Contas
desativadas continuam sendo verificadas na configuração local, e erros de
autenticação/cota continuam acionando a proteção do Auto. Perguntas leves usam
um limite de oito segundos por tentativa antes de buscar uma alternativa.
Na conversa livre, o título por IA só é solicitado depois da resposta, para não
competir pela conta durante o pedido principal. O título provisório aparece imediatamente.

Respostas em texto, Markdown e blocos dos provedores são aceitas no chat, além do
JSON estruturado. Conteúdo vazio não é confundido com autenticação inválida.
Em caso de falha, **Tentar novamente** repete o pedido sem apagar seu rascunho;
**Ver contas** abre os ajustes na mesma ilha. Erros continuam visíveis no histórico,
mas não são enviados ao modelo como se fossem respostas válidas do agente.
O adaptador integrado também corrige em memória a tradução de Responses do Copilot
no 9Router 0.5.40, sem editar as dependências compartilhadas.

Em **Consumo**, escolha **Geral** ou uma conta e o período: hoje, 7 dias, 30 dias
ou todo o histórico. Pedidos, tokens e custo estimado vêm do histórico do 9Router;
uso feito fora dele pode aparecer nas cotas do provedor, mas não nesses contadores.
As barras mostram as cotas e seus resets quando o provedor informa esses dados.
Dados indisponíveis aparecem como tal, sem estimar percentuais ou resets.

Quando o perfil próprio do roteador está vazio e existem contas no 9Router
instalado, esta versão usa o armazenamento nativo `%APPDATA%\9router` para manter
logins e histórico sincronizados, sem duplicar tokens de OAuth. Perfis próprios
que já têm contas são mantidos. Projetos, personagens e rascunhos continuam
independentes em `%APPDATA%\MESP Top Dock`. A autenticação local do painel é
mantida no processo principal, sem mudar a senha ou a proteção do 9Router existente.

Exemplos de pedidos:

- **Abrir projeto** — escolhe uma pasta e abre o agente.
- **Novo projeto** — adiciona outra pasta.
- **Novo MESP** — abre a mesma criação do botão +.
- **Chame o Claude** — abre os modelos para escolher uma conta pelo 9Router.
- **Peça ao Codex para revisar o código** — procura um modelo Codex disponível pelo 9Router.
- **Meus projetos** — mostra os MESP disponíveis dentro da conversa.
- **Abra o projeto nome-do-projeto** — muda para um projeto salvo.
- **Personalize o MESP** — abre a personalização do personagem.
- **Minimizar** — recolhe a ilha.

Os comandos de gerenciamento acima são reconhecidos localmente. Outros pedidos
são encaminhados ao modelo selecionado pelo 9Router, usando as contas desse painel.
O aplicativo informa quando o runtime de ferramentas precisa ser configurado.

Até 10 projetos podem permanecer abertos. A lista de pastas, agentes e personagens
é salva em um perfil separado: `%APPDATA%\MESP Top Dock`.
Sair pelo botão de energia ou pelo ícone da bandeja encerra os processos.
Ao reabrir, as configurações são restauradas; os processos iniciam novas sessões.

O código original do MESP e sua instalação do Coucou foram preservados.
Esta cópia na pasta GitHub tem dependências e runtime próprios.

Validação: `npm test`, `npm run lint`, `npm run build`, `npm run test:dock`, `npm run test:usability`, `npm run test:history`,
`npm run test:router` e `npm run test:router:auto`.
Os testes usam perfis isolados e janelas ocultas. O teste do Auto executa o
9Router instalado com um provedor local de teste e verifica complexidade, cota,
reset, distribuição simultânea, recuperação de respostas vazias, cancelamento,
tradução de Responses, fallback, streaming e consumo por conta. Esses testes não comprovam login em
contas reais nem enviam tarefas às APIs de IA.
O teste do painel abre as páginas do 9Router instalado dentro da mesma janela,
salva um formulário real somente no perfil de teste e verifica a preservação de
campos ao recolher, a troca para o chat e o encaixe dos modais em telas estreitas.
