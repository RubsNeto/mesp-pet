// Only visible assistant text is extracted. Reasoning and tool arguments stay private.
const textBlocks = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => ['text', 'output_text'].includes(part?.type))
    .map((part) => (typeof part.text === 'string' ? part.text : part.text?.value || ''))
    .filter((part) => typeof part === 'string')
    .join('\n');
};

export function routerResponseText(payload) {
  if (!payload || typeof payload !== 'object' || payload.error) return '';
  if (typeof payload.answer === 'string') return payload.answer;
  const choice = payload.choices?.[0];
  const text = textBlocks(choice?.message?.content) || choice?.message?.refusal || choice?.text;
  if (typeof text === 'string' && text.trim()) return text;
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (Array.isArray(payload.output))
    return payload.output
      .filter((item) => item?.type === 'message' && item.role === 'assistant')
      .map((item) => textBlocks(item.content))
      .join('\n');
  return payload.role === 'assistant' ? textBlocks(payload.content) : '';
}

export function parseRouterConversation(payload) {
  if (payload?.error) return null;
  if (payload && typeof payload === 'object' && typeof payload.answer === 'string') {
    if (!payload.answer.trim() || payload.answer.length > 64000) return null;
    return { answer: payload.answer.trim(), needsProject: payload.needsProject === true };
  }
  // Providers differ in format support. A valid plain answer must not become a login error.
  let content = typeof payload === 'string' ? payload : routerResponseText(payload);
  if (typeof content !== 'string' || !content.trim() || content.length > 64000) return null;
  content = content.trim();
  const unfenced = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let structured;
  try {
    structured = JSON.parse(unfenced);
  } catch {
    // Do not display a truncated internal envelope as an answer.
    if (/^\{\s*"(?:answer|needsProject)"\s*:/.test(unfenced)) return null;
  }
  if (structured && typeof structured === 'object' && 'answer' in structured) {
    if (typeof structured.answer !== 'string' || !structured.answer.trim()) return null;
    return {
      answer: structured.answer.trim(),
      needsProject: structured.needsProject === true,
    };
  }
  // Plain text never opens a folder chooser. Project access remains an explicit user action.
  return { answer: content, needsProject: false };
}
