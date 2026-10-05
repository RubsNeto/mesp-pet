const clean = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const webTopic = /\b(site|website|pagina|landing\s*page|portfolio|html|front.?end|webapp)\b/;
const buildAction =
  /\b(crie|cria|criar|create|construa|construir|build|faca|fazer|desenvolva|desenvolver|implemente|implementar|monte|montar|quero|preciso)\b/;
const createAction =
  /\b(crie|cria|criar|create|construa|construir|build|faca|fazer|desenvolva|desenvolver|implemente|implementar|monte|montar|gere|gerar|salve|salvar|grave|gravar)\b/;
const todoTopic =
  /\b(?:todo\s*list|to[ -]?do[ -]?list|lista de tarefas|lista de afazeres|gerenciador de tarefas)\b/;
const fileDeliverable = /\b(?:arquivo|txt|markdown|md|csv|json|pdf|docx|xlsx|script|python)\b/;
const chatContent =
  /\b(?:poema|poesia|piada|conto|historia|resumo|explicacao|resposta|mensagem|email|ideias|sugestoes|exemplo|traducao|roteiro|legenda)\b/;
const explanation = (text) =>
  /^(?:(?:oi|ola)[,!. ]+)?(?:como\b|explique\b|explica\b|ensine\b|o que\b|qual\b|quais\b|tutorial\b|mostre um exemplo\b)/.test(
    text,
  ) ||
  /\b(?:so|apenas) (?:o )?codigo\b|\b(?:nao|sem) (?:criar|alterar|editar|executar) (?:os )?arquivos\b/.test(
    text,
  );
const taskAction =
  /\b(corrija|corrige|conserte|implemente|altere|modifique|adicione|remova|refatore|rode|execute|teste|instale|atualize|investigue|analise|pesquise|organize|automatize)\b/;
const continuation =
  /^(?:sim[,!. ]*)?(?:continue|pode continuar|prossiga|pode fazer|faca isso|faca|execute|pode executar|agora implemente)[.! ]*$/;
const previousPrompt = (history) =>
  [...history]
    .reverse()
    .find((item) => item.role === 'user' && !continuation.test(clean(item.content || item.text)));

const computerLocation =
  /(?:[a-z]:[\\/]|\\\\[^\\\s]+\\|%(?:userprofile|appdata|localappdata|onedrive|temp|programfiles)%|\b(?:downloads|desktop|area de trabalho|meus documentos|meu pc|meu computador|neste pc|neste computador|no windows|disco [a-z])\b)/;
const computerAction =
  /\b(?:leia|ler|liste|listar|abra|abre|abrir|copie|copiar|mova|mover|renomeie|localize|encontre|busque|verifique|veja|mostre|consulte|inspecione|organize|execute|rode|instale|desinstale|atualize|crie|faca|corrija|altere|edite|salve|grave|remova|apague)\b/;

export function isComputerTaskRequest(prompt, history = []) {
  const text = clean(prompt).trim();
  if (continuation.test(text)) {
    const previous = previousPrompt(history);
    return previous ? isComputerTaskRequest(previous.content || previous.text) : false;
  }
  // Local factual questions need tools; tutorials and code examples remain conversation.
  const localQuestion =
    /^(?:quanto|qual).*espaco.*(?:disco|pc|computador)|^quais (?:programas|aplicativos|arquivos|pastas|processos).*(?:instalad|tenho|existem|estao|ha\b)|^qual.*versao.*instalad|^o que (?:tem|ha|existe) (?:em|na|no)\b/.test(
      text,
    );
  if (explanation(text) && !localQuestion) return false;
  if (computerLocation.test(text) && (computerAction.test(text) || localQuestion)) return true;
  if (localQuestion && /\b(?:programas|aplicativos|processos|versao)\b/.test(text)) return true;
  return (
    (/\b(?:abra|inicie|execute|rode)\b/.test(text) &&
      /\b(?:programa|aplicativo|chrome|edge|firefox|notepad|bloco de notas|calculadora|powershell|terminal|comando|ipconfig|systeminfo|explorer)\b/.test(
        text,
      )) ||
    /^(?:quanto|qual).*espaco.*(?:disco|meu pc|meu computador)/.test(text)
  );
}

export function isWebProjectRequest(prompt, history = []) {
  const text = clean(prompt);
  if (explanation(text)) return false;
  if (continuation.test(text)) {
    const previous = previousPrompt(history);
    return previous ? isWebProjectRequest(previous.content || previous.text) : false;
  }
  if (!buildAction.test(text) && !createAction.test(text) && !taskAction.test(text)) return false;
  if (webTopic.test(text)) return true;
  // A to-do list is an interactive deliverable unless a file format was requested.
  if (todoTopic.test(text) && !fileDeliverable.test(text)) return true;
  return (
    /\b(projeto completo|arquivos|link|abra|abrir|execute|executar|rode|rodar)\b/.test(text) &&
    history
      .filter((item) => item.role === 'user')
      .slice(-4)
      .some((item) => webTopic.test(clean(item.content || item.text)))
  );
}

export function shouldExecuteProjectRequest(prompt, history = []) {
  if (isComputerTaskRequest(prompt, history)) return true;
  if (isWebProjectRequest(prompt, history)) return true;
  const text = clean(prompt);
  if (explanation(text)) return false;
  if (continuation.test(text)) {
    const previous = previousPrompt(history);
    return previous ? shouldExecuteProjectRequest(previous.content || previous.text) : false;
  }
  if (
    buildAction.test(text) &&
    /\b(botao|componente|funcao|arquivo|classe|teste|rota|api|interface|script|aplicativo|app|sistema|programa|automacao|relatorio|planilha|documento|csv|json|python|checklist|agenda|calendario|dashboard|painel|formulario|grafico|tabela|lista de compras|lista de tarefas|lista de afazeres|todolist)\b/.test(
      text,
    )
  )
    return true;
  // Commands to produce a deliverable should execute without a closed vocabulary.
  // Content requested for the conversation still uses the fast path.
  if (createAction.test(text) && (!chatContent.test(text) || fileDeliverable.test(text)))
    return true;
  return taskAction.test(text);
}

export function shouldCreateTaskWorkspace(prompt, history = []) {
  if (isComputerTaskRequest(prompt, history)) return true;
  const text = clean(prompt);
  if (explanation(text)) return false;
  if (continuation.test(text)) {
    const previous = previousPrompt(history);
    return previous ? shouldCreateTaskWorkspace(previous.content || previous.text) : false;
  }
  // Existing files need a selected project; a new deliverable can use the MESP's own folder.
  if (
    /\b(corrija|corrige|conserte|altere|modifique|adicione|remova|refatore|investigue|atualize|instale)\b/.test(
      text,
    ) ||
    (/\b(analise|organize|teste|rode|execute)\b/.test(text) &&
      /\b(projeto|repositorio|arquivos|codigo)\b/.test(text))
  )
    return false;
  return shouldExecuteProjectRequest(prompt, history);
}

export const taskExecutionInstructions = [
  'Execute a tarefa com ferramentas; não se limite a devolver código ou prometer ações. A pasta atual é um ponto de partida, não um limite de acesso.',
  'Você pode ler e alterar arquivos, consultar o sistema e executar programas e comandos em qualquer pasta acessível ao usuário do Windows, inclusive fora do projeto. Use caminhos absolutos para destinos externos.',
  'Para localizar arquivos, comece pelo caminho informado ou pelas pastas pessoais relevantes. Faça buscas direcionadas antes de percorrer discos inteiros, para manter a tarefa rápida.',
  'Para copiar arquivos sem alterar o conteúdo, use mesp_computer_copy_file, que preserva os bytes e verifica SHA-256 automaticamente; não reconstrua o arquivo a partir da saída da ferramenta read, que inclui números de linha e metadados. Preserve a codificação e as quebras de linha. Não sobrescreva um destino existente sem isso fazer parte do pedido.',
  'Antes de alterar, examine os arquivos relevantes e preserve alterações existentes. Aja nos arquivos e programas necessários ao pedido; não altere projetos ou dados sem relação com a tarefa.',
  'Produza os arquivos e resultados necessários, execute as verificações apropriadas e corrija falhas encontradas.',
  'Pedidos como crie, faça, monte ou gere são ordens para produzir o resultado. Escolha uma solução simples quando detalhes opcionais não forem informados. Não transforme a tarefa em um tutorial nem devolva passos para o usuário executar por você.',
  'Ao validar uma operação, faça a verificação falhar com um erro se o resultado estiver incorreto. Em PowerShell use $ErrorActionPreference = "Stop" e throw quando uma condição esperada não for atendida; imprimir False e encerrar com código zero não comprova sucesso.',
  'Pedidos de análise ou pesquisa devem consultar fontes ou arquivos reais e distinguir fatos verificados de hipóteses.',
  'Não invente execução, testes, dados, links, publicação ou sucesso. Informe bloqueios e etapas que não conseguiu verificar.',
  'Não publique, faça push ou envie mensagens a terceiros sem isso fazer parte do pedido. Não abra servidores em segundo plano por conta própria.',
  'Conclua com uma resposta curta em português indicando o resultado, arquivos relevantes e verificações realizadas.',
].join('\n');

export const webProjectInstructions = [
  'Este é um pedido para implementar um projeto web de verdade, não apenas devolver exemplos de código.',
  'Use as ferramentas para criar e editar os arquivos na pasta atual e verificar o resultado. Preserve arquivos e alterações existentes.',
  'Para HTML, CSS e JavaScript simples, mantenha index.html na raiz, estilos e scripts em arquivos próprios, com caminhos relativos e interações funcionais.',
  'Se o pedido for criar uma todolist ou lista de tarefas sem formato especificado, entregue um aplicativo web simples: adicionar tarefas, marcar e desmarcar como concluídas, excluir e salvar localmente para persistir após recarregar. Comece sem tarefas fictícias. Faça a interface responsiva e teste as interações. Se o usuário pedir explicitamente TXT, Markdown ou outro arquivo, respeite esse formato.',
  'Se o projeto já usa um framework, siga a estrutura existente, instale as dependências necessárias e execute o build. A prévia aceita dist/index.html e build/index.html.',
  'Se houver formulários POST ou uma API local, implemente um backend Node e grave .mesp-preview.json com {"entry":"server.cjs"}, usando o caminho real do servidor. O servidor deve servir a página e a API em HTTP, escutar process.env.PORT e process.env.HOST (127.0.0.1), e permanecer em primeiro plano. O MESP inicia, verifica e encerra esse processo automaticamente. Não simule um envio bem-sucedido sem processar os dados.',
  'Confira a sintaxe, os recursos referenciados e a responsividade. Não considere a tarefa concluída apenas por escrever código na resposta.',
  'Para telas pequenas, use box-sizing: border-box, limite contêineres à largura disponível e aplique min-width: 0 nos filhos flexíveis. Não some padding a larguras em vw sem border-box. Verifique que a página não produz rolagem horizontal em 320px e 390px.',
  'O MESP inicia a prévia local e oferece o link depois que os arquivos estiverem prontos. Não invente URLs, não abra processos de servidor em segundo plano nem publique na internet sem um pedido explícito.',
  'Ao concluir, responda brevemente em português com o que foi feito e verificado e indique que o botão Abrir site aparecerá no resultado. Não diga que não pode fornecer um link nem peça ao usuário para abrir index.html manualmente: o MESP fornece a prévia. Se uma etapa falhar, informe a falha; não afirme que o projeto está funcionando sem verificá-lo.',
].join('\n');
