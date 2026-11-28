// User-owned API keys are used only for this request; never persisted or logged.
const fail = (status, message) => Object.assign(new Error(message), { status });
function validateAI(input) {
  if (
    !input ||
    !['openai', 'gemini', 'claude'].includes(input.provider) ||
    typeof input.apiKey !== 'string' ||
    input.apiKey.length < 16 ||
    input.apiKey.length > 512 ||
    /[\r\n\s]/.test(input.apiKey) ||
    typeof input.model !== 'string' ||
    !/^[a-zA-Z0-9._:-]{1,100}$/.test(input.model) ||
    !Array.isArray(input.messages) ||
    !input.messages.length ||
    input.messages.length > 20 ||
    input.messages.some(
      (m) =>
        !m ||
        !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' ||
        !m.content.trim() ||
        m.content.length > 12000,
    ) ||
    input.messages.at(-1).role !== 'user' ||
    JSON.stringify(input.messages).length > 70000
  )
    throw fail(
      400,
      'Informe provedor, modelo, chave de API e uma conversa válida (até 20 mensagens).',
    );
  return {
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.model,
    messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
  };
}
async function generateAI(raw, fetchImpl = fetch, options = {}) {
  const input = validateAI(raw),
    headers = { 'Content-Type': 'application/json' };
  let url, body;
  if (input.provider === 'openai') {
    url = 'https://api.openai.com/v1/responses';
    headers.Authorization = `Bearer ${input.apiKey}`;
    body = { model: input.model, input: input.messages, max_output_tokens: 1500, store: false };
  } else if (input.provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`;
    headers['x-goog-api-key'] = input.apiKey;
    body = {
      contents: input.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 1500 },
    };
  } else {
    url = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = input.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = { model: input.model, messages: input.messages, max_tokens: 1500 };
  }
  const tools = options.tools || [];
  if (input.provider === 'openai') {
    if (options.instructions) body.instructions = options.instructions;
    if (tools.length)
      body.tools = tools.map((tool) => ({ type: 'function', ...tool, strict: false }));
    if (options.previous)
      body.input = [
        ...options.previous.input,
        ...options.previous.output,
        ...options.results.map((result) => ({
          type: 'function_call_output',
          call_id: result.id,
          output: JSON.stringify(result.value),
        })),
      ];
  } else if (input.provider === 'gemini') {
    if (options.instructions) body.systemInstruction = { parts: [{ text: options.instructions }] };
    if (tools.length)
      body.tools = [
        {
          functionDeclarations: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: {
              type: tool.parameters.type,
              properties: tool.parameters.properties,
              required: tool.parameters.required,
            },
          })),
        },
      ];
    if (options.previous)
      body.contents = [
        ...options.previous.input,
        options.previous.output,
        {
          role: 'user',
          parts: options.results.map((result) => ({
            functionResponse: { name: result.name, response: { result: result.value } },
          })),
        },
      ];
  } else {
    if (options.instructions) body.system = options.instructions;
    if (tools.length)
      body.tools = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
    if (options.previous)
      body.messages = [
        ...options.previous.input,
        { role: 'assistant', content: options.previous.output },
        {
          role: 'user',
          content: options.results.map((result) => ({
            type: 'tool_result',
            tool_use_id: result.id,
            content: JSON.stringify(result.value),
          })),
        },
      ];
  }
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs || 60000),
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel?.();
      throw fail(
        response.status === 429 ? 429 : response.status >= 500 ? 502 : 400,
        response.status === 429
          ? 'Limite ou saldo do provedor atingido. Confira sua conta de API.'
          : 'O provedor recusou a solicitação. Confira chave, modelo e saldo na sua conta de API.',
      );
    }
    let bytes = 0,
      text = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) throw fail(502, 'Resposta da IA acima do limite.');
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    const data = JSON.parse(text);
    const output =
      input.provider === 'openai'
        ? data.output || []
        : input.provider === 'gemini'
          ? data.candidates?.[0]?.content
          : data.content || [];
    const calls =
      input.provider === 'openai'
        ? (data.output || [])
            .filter((o) => o.type === 'function_call')
            .map((o) => ({ id: o.call_id, name: o.name, args: o.arguments }))
        : input.provider === 'gemini'
          ? (output?.parts || [])
              .filter((p) => p.functionCall)
              .map((p, i) => ({
                id: `gemini-${i}`,
                name: p.functionCall.name,
                args: p.functionCall.args,
              }))
          : (data.content || [])
              .filter((c) => c.type === 'tool_use')
              .map((c) => ({ id: c.id, name: c.name, args: c.input }));
    const answer =
      input.provider === 'openai'
        ? (data.output || [])
            .flatMap((o) => o.content || [])
            .filter((c) => c.type === 'output_text')
            .map((c) => c.text)
            .join('\n')
        : input.provider === 'gemini'
          ? (data.candidates?.[0]?.content?.parts || [])
              .filter((p) => !p.thought)
              .map((p) => p.text || '')
              .join('\n')
          : (data.content || [])
              .filter((c) => c.type === 'text')
              .map((c) => c.text)
              .join('\n');
    if (!answer.trim() && !calls.length)
      throw fail(502, 'O provedor não retornou texto. Tente outra mensagem ou modelo.');
    if (calls.length > 6)
      throw fail(502, 'A IA tentou solicitar ações demais de uma vez. Divida o pedido.');
    return {
      answer: answer.slice(0, 12000),
      provider: input.provider,
      model: input.model,
      ...(options.tools
        ? { calls, state: { input: body.input || body.contents || body.messages, output } }
        : {}),
    };
  } catch (error) {
    if (error.status) throw error;
    throw fail(
      502,
      'Não foi possível concluir a resposta da IA. Verifique o provedor antes de repetir; a chamada pode ter gerado cobrança.',
    );
  }
}
module.exports = { validateAI, generateAI };
