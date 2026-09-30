# MESP Top Dock

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

Validação: `npm test`, `npm run lint`, `npm run build` e `npm run test:dock`.
O teste Electron usa terminais locais de teste, sem enviar tarefas às APIs de IA.
