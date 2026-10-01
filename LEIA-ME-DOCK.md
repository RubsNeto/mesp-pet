# MESP Top Dock

## Revisão de uso de 1º de outubro de 2026

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
recolher a ilha. **Ctrl+K** volta ao campo de conversa. Há confirmação dentro da
ilha ao tentar sair com agentes ou verificações ativos, incluindo pelo tray e
pelo fechamento da janela. Recolher mantém as tarefas em andamento.

A auditoria, os resultados e as limitações estão em **AUDITORIA-DOCK-20261001.md**.

Versão local do MESP com a ilha superior do Coucou: preto, cartões discretos,
expansão com mola, personagem sem contorno colorido e conversa sem barra lateral.

Abra pelo atalho **MESP Top Dock** ou pelo arquivo `Abrir-MESP.ps1`.
Clique no personagem para conversar. Para recolher, use a seta para baixo.
As sessões continuam abertas ao recolher ou trocar de projeto.

Use **+** para criar e mostrar um MESP imediatamente, sem formulário. Ele usa
a pasta e o agente do MESP atual. Se não houver uma pasta aberta, peça **Abrir projeto**.
A IA dá um título à tarefa automaticamente depois do primeiro pedido, usando
o login existente do Codex ou Claude em uma consulta curta, separada da sessão
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

Codex e Claude avisam a conclusão por eventos locais da própria sessão. O MESP
concluído vira o principal, sem substituir o chat ou o rascunho que você está usando.
Clique nele ou em **Ver resultado** para ler a resposta. Chat é o modo padrão;
**Terminal** mantém acesso à interface nativa, inclusive login e permissões.
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

As conversas do Codex, Claude e demais agentes de terminal também são salvas
por MESP. Ao reabrir, o histórico permanece e uma indicação separa a conversa
anterior da nova sessão do agente. O texto salvo não é reenviado automaticamente.
O histórico mantém as 100 mensagens mais recentes, com limite de tamanho por MESP.
O MESP Code mantém seu histórico próprio. Use o ícone **Copiar resposta** abaixo
das respostas ou **Copiar código** no bloco de código. O ícone confirma a cópia.
Ao ler mensagens antigas, **Ir para o fim** volta à resposta mais recente;
**Novas mensagens** avisa quando chegou texto enquanto você estava lendo.

Em **Configurações**, busque modelos entre todas as contas habilitadas. Modelos
consultados na conta são identificados; quando o provedor só oferece um catálogo,
a disponibilidade é confirmada ao usar. Contas com autenticação expirada mostram
**Reconectar** e ficam fora do Auto. O login continua no painel nativo do 9Router.

Escolha **Auto · priorizar o próximo reset** e **Usar neste MESP**. A cada pedido,
o roteador escolhe um modelo de programação e uma conta com cota disponível,
priorizando o reset mais próximo. Ele considera as janelas de cota aplicáveis
ao modelo e ignora contas desativadas, esgotadas ou bloqueadas temporariamente.
Contas sem reset informado são alternativas depois das que têm reset conhecido.
Falhas antes do início da resposta permitem tentar outra conta ou um modelo
alternativo quando o provedor informa que o primeiro não é suportado. Uma resposta em
andamento permanece na mesma conta. O Auto funciona pelo adaptador integrado
compatível com o 9Router 0.5.40, sem editar as dependências compartilhadas.

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
- **Chame o Claude** — abre um MESP com Claude Code na pasta atual.
- **Peça ao Codex para revisar o código** — envia o pedido ao Codex da pasta atual.
- **Meus projetos** — mostra os MESP disponíveis dentro da conversa.
- **Abra o projeto nome-do-projeto** — muda para um projeto salvo.
- **Personalize o MESP** — abre a personalização do personagem.
- **Minimizar** — recolhe a ilha.

Os comandos de gerenciamento acima são reconhecidos localmente. Outros pedidos
são encaminhados à CLI do agente selecionado, usando seu login e permissões.
CLIs que não estiverem instaladas são informadas na conversa.

Até 10 projetos podem permanecer abertos. A lista de pastas, agentes e personagens
é salva em um perfil separado: `%APPDATA%\MESP Top Dock`.
Sair pelo botão de energia ou pelo ícone da bandeja encerra os processos.
Ao reabrir, as configurações são restauradas; os processos iniciam novas sessões.

O código original do MESP e sua instalação do Coucou foram preservados.
Esta versão usa o runtime já instalado no repositório original do MESP.

Validação: `npm test`, `npm run lint`, `npm run build`, `npm run test:dock`, `npm run test:usability`, `npm run test:history`,
`npm run test:router` e `npm run test:router:auto`.
Os testes usam perfis isolados e janelas ocultas. O teste do Auto executa o
9Router instalado com um provedor local de teste e verifica seleção por reset,
fallback, streaming e consumo por conta. Esses testes não comprovam login em
contas reais nem enviam tarefas às APIs de IA.
O teste do painel abre as páginas do 9Router instalado dentro da mesma janela,
salva um formulário real somente no perfil de teste e verifica a preservação de
campos ao recolher, a troca para o chat e o encaixe dos modais em telas estreitas.
