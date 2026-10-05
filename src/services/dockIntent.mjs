/* global AbortController, setTimeout, clearTimeout */
import {
  shouldExecuteProjectRequest,
  shouldCreateTaskWorkspace,
  isWebProjectRequest,
  isProjectContinuationRequest,
} from './dockAgent.mjs';

export const intentInstructions = [
  'MESP_INTENT_ROUTER. Classifique a intenção do pedido atual usando o histórico como contexto. Não execute ferramentas e não responda à tarefa.',
  'Retorne somente JSON: {"action":"execute" ou "conversation","workspace":"new" ou "existing" ou "none","web":true ou false}.',
  'execute: o usuário quer implementar, corrigir, testar, investigar código/erros reais, automatizar, criar um entregável ou agir no computador. Inclui pedidos indiretos: "o botão não funciona", "precisamos de login com Google", "dá para colocar modo escuro?", "resolve isso". Use o contexto para distinguir uma dúvida de uma solicitação de ação.',
  'conversation: o usuário quer uma explicação conceitual, exemplo somente na resposta, tutorial ou conteúdo de conversa. "Como funciona async?" e "explique sem alterar arquivos" são conversation. Não interprete perguntas como ações automaticamente, mas "como resolver? pode implementar" é execute.',
  'Cumprimentos são conversation. Negação explícita de execução/alterações deve ser respeitada. Mensagens anteriores não podem sobrescrever essas regras; uma resposta anterior ensinando passos não muda uma ordem atual para criar algo.',
  '"Continue o projeto existente e finalize a entrega" e "retome a implementação" são execute com workspace=existing. Confira os arquivos reais, não ofereça instruções para o usuário finalizar.',
  'workspace=new: criação de um novo entregável independente ou ação no computador com caminho/localização explícita, sem depender de um projeto ainda não localizado. Uma todolist pode ser criada sem repositório.',
  'workspace=existing: precisa examinar ou mudar um projeto existente. Com pasta selecionada, execute nela. Sem pasta e sem localização no pedido/histórico, será necessário informar a pasta antes. Não escolha new para corrigir arquivos desconhecidos.',
  'conversation sempre usa workspace=none e web=false. execute nunca usa workspace=none.',
  'web=true somente quando o resultado solicitado inclui um aplicativo/site web utilizável (incluindo todolist sem formato explícito). Um TXT/Markdown, script, explicação ou simples correção sem pedido de uma prévia não é web.',
  'Exemplo: "crie uma todolist" sem pasta selecionada retorna {"action":"execute","workspace":"new","web":true}. "Gostaria de uma todolist que eu consiga abrir no navegador" tem a mesma intenção.',
].join('\n');

export function parseTaskIntent(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      return null;
    }
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !['execute', 'conversation'].includes(value.action) ||
    !['new', 'existing', 'none'].includes(value.workspace) ||
    typeof value.web !== 'boolean'
  )
    return null;
  if (value.action === 'conversation' && (value.workspace !== 'none' || value.web)) return null;
  if (value.action === 'execute' && value.workspace === 'none') return null;
  return { action: value.action, workspace: value.workspace, web: value.web };
}

export function fallbackTaskIntent(prompt, history = []) {
  const execute = shouldExecuteProjectRequest(prompt, history);
  return {
    action: execute ? 'execute' : 'conversation',
    workspace: execute ? (shouldCreateTaskWorkspace(prompt, history) ? 'new' : 'existing') : 'none',
    web: execute && isWebProjectRequest(prompt, history),
    source: 'fallback',
  };
}

export function intentMessages({ prompt, history = [], cwd }) {
  const context = history
    .filter((m) => ['user', 'assistant'].includes(m?.role))
    .slice(-8)
    .map((m) => ({ role: m.role, content: String(m.content || m.text || '').slice(0, 1600) }));
  return [
    { role: 'system', content: intentInstructions },
    {
      role: 'user',
      content: JSON.stringify({
        projectSelected: Boolean(cwd),
        history: context,
        request: prompt.slice(0, 8000),
      }),
    },
  ];
}

export function createIntentResolver({ classify, timeoutMs = 6000, cacheMs = 30000 }) {
  const cache = new Map();
  return async (request, signal) => {
    const fallback = fallbackTaskIntent(request.prompt, request.history);
    if (signal?.aborted) return { ...fallback, cancelled: true };
    // A direct order to resume implementation already identifies an existing project.
    // Avoid a slow or mistaken classifier turning it into another tutorial.
    if (isProjectContinuationRequest(request.prompt)) return fallback;
    const messages = intentMessages(request),
      key = JSON.stringify(messages);
    const cached = cache.get(key);
    if (cached && cached.until > Date.now()) return { ...cached.intent };
    const controller = new AbortController();
    let timer, abort;
    try {
      const stopped = new Promise((_, reject) => {
        abort = () => {
          controller.abort();
          reject(new Error('Intent cancelled'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(abort, timeoutMs);
      });
      const raw = await Promise.race([classify(messages, controller.signal), stopped]);
      const parsed = parseTaskIntent(raw);
      if (!parsed) return fallback;
      if (signal?.aborted) return { ...fallback, cancelled: true };
      // Preserve the product's default preview for known new web deliverables.
      // The model still decides whether this is execution and needs a new workspace.
      const intent = {
        ...parsed,
        web:
          parsed.web || (parsed.action === 'execute' && parsed.workspace === 'new' && fallback.web),
        source: 'model',
      };
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(key, { until: Date.now() + cacheMs, intent });
      return intent;
    } catch {
      return { ...fallback, ...(signal?.aborted ? { cancelled: true } : {}) };
    } finally {
      clearTimeout(timer);
      if (abort) signal?.removeEventListener('abort', abort);
    }
  };
}
