const clean = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const webTopic =
  /\b(site|website|pagina|landing\s*page|portfolio|html|css|javascript|front.?end|webapp)\b/;
const buildAction =
  /\b(crie|cria|criar|create|construa|construir|build|faca|fazer|desenvolva|desenvolver|implemente|implementar|monte|montar|quero|preciso)\b/;

export function isWebProjectRequest(prompt, history = []) {
  const text = clean(prompt);
  if (
    /\b(como|explique|explica|ensine|tutorial|exemplo|so (?:o )?codigo|apenas (?:o )?codigo|mostre (?:o )?codigo)\b/.test(
      text,
    )
  )
    return false;
  if (!buildAction.test(text)) return false;
  if (webTopic.test(text)) return true;
  return (
    /\b(projeto completo|arquivos|link|abra|abrir|execute|executar|rode|rodar)\b/.test(text) &&
    history
      .filter((item) => item.role === 'user')
      .slice(-4)
      .some((item) => webTopic.test(clean(item.content || item.text)))
  );
}

export function shouldExecuteProjectRequest(prompt, history = []) {
  if (isWebProjectRequest(prompt, history)) return true;
  const text = clean(prompt);
  if (/^(como|explique|explica|o que|qual|mostre um exemplo)\b/.test(text)) return false;
  if (
    buildAction.test(text) &&
    /\b(botao|componente|funcao|arquivo|classe|teste|rota|api|interface|script)\b/.test(text)
  )
    return true;
  return /\b(corrija|corrige|conserte|implemente|altere|modifique|adicione|remova|refatore|rode|execute|teste|instale|atualize)\b/.test(
    text,
  );
}

export const webProjectInstructions = [
  'Este é um pedido para implementar um projeto web de verdade, não apenas devolver exemplos de código.',
  'Use as ferramentas para criar e editar os arquivos na pasta atual e verificar o resultado. Preserve arquivos e alterações existentes.',
  'Para HTML, CSS e JavaScript simples, mantenha index.html na raiz, estilos e scripts em arquivos próprios, com caminhos relativos e interações funcionais.',
  'Se o projeto já usa um framework, siga a estrutura existente, instale as dependências necessárias e execute o build. A prévia aceita dist/index.html e build/index.html.',
  'Confira a sintaxe, os recursos referenciados e a responsividade. Não considere a tarefa concluída apenas por escrever código na resposta.',
  'O MESP inicia a prévia local e oferece o link depois que os arquivos estiverem prontos. Não invente URLs, não abra processos de servidor em segundo plano nem publique na internet sem um pedido explícito.',
  'Ao concluir, responda brevemente em português com o que foi feito e verificado e indique que o botão Abrir site aparecerá no resultado. Não diga que não pode fornecer um link nem peça ao usuário para abrir index.html manualmente: o MESP fornece a prévia. Se uma etapa falhar, informe a falha; não afirme que o projeto está funcionando sem verificá-lo.',
].join('\n');
