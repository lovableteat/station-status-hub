import { createClient } from 'npm:@supabase/supabase-js@2.100.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'retry-after, x-request-id',
};
const respond = (message: string, status: number) => new Response(JSON.stringify({ error: { message } }), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};


// Forward only bounded, explicitly supported per-request generation options.
// Keep credentials, model selection and upstream URL under the existing guards.
function generationOptions(chat: Record<string, unknown>) {
  const options: Record<string, unknown> = {};
  if (chat.max_completion_tokens !== undefined) {
    if (!Number.isInteger(chat.max_completion_tokens) || Number(chat.max_completion_tokens) < 1 || Number(chat.max_completion_tokens) > 32_768)
      throw new TypeError("Invalid completion token budget");
    options.max_completion_tokens = chat.max_completion_tokens;
  }
  if (chat.reasoning_effort !== undefined) {
    if (typeof chat.reasoning_effort !== 'string' || !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(chat.reasoning_effort))
      throw new TypeError("Invalid reasoning effort");
    options.reasoning_effort = chat.reasoning_effort;
  }
  if (chat.store !== undefined) {
    // Opting out is supported; this endpoint cannot opt an existing conversation
    // into provider-side storage on a caller's behalf.
    if (chat.store !== false) throw new TypeError("Provider storage must remain disabled");
    options.store = false;
  }
  if (chat.response_format !== undefined) {
    const format = object(chat.response_format);
    if (format.type === 'json_object' || format.type === 'text') {
      if (Object.keys(format).some(key => key !== 'type')) throw new TypeError("Invalid response format");
      options.response_format = { type: format.type };
    } else if (format.type === 'json_schema') {
      if (Object.keys(format).some(key => !['type', 'json_schema'].includes(key))) throw new TypeError("Invalid response format");
      const definition = object(format.json_schema);
      if (typeof definition.name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(definition.name)
        || Object.keys(definition).some(key => !['name', 'description', 'schema', 'strict'].includes(key))
        || (definition.strict !== undefined && typeof definition.strict !== 'boolean')
        || (definition.description !== undefined && (typeof definition.description !== 'string' || definition.description.length > 1000)))
        throw new TypeError("Invalid schema definition");
      const schema = object(definition.schema);
      if (schema.type !== 'object' || JSON.stringify(schema).length > 32_768) throw new TypeError("Invalid schema root or size");
      let nodes = 0;
      const check = (value: unknown, depth: number) => {
        if (++nodes > 5000 || depth > 16) throw new TypeError("Schema is too complex");
        if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError("Invalid schema number");
        if (typeof value === 'string' && value.length > 16_384) throw new TypeError("Schema value is too long");
        if (Array.isArray(value)) { for (const child of value) check(child, depth + 1); return; }
        if (!value || typeof value !== 'object') return;
        for (const child of Object.values(object(value))) check(child, depth + 1);
      };
      check(schema, 0);
      const checkSchema = (value: unknown) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError("Invalid schema node");
        const entry = object(value);
        if (entry.$ref !== undefined && (typeof entry.$ref !== 'string' || !entry.$ref.startsWith('#/')))
          throw new TypeError("Only local schema references are supported");
        if (entry.type !== undefined) {
          const types = Array.isArray(entry.type) ? entry.type : [entry.type];
          if (!types.length || types.some(type => typeof type !== 'string' || !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type)))
            throw new TypeError("Invalid schema type");
        }
        if (entry.required !== undefined && (!Array.isArray(entry.required) || entry.required.some(key => typeof key !== 'string')))
          throw new TypeError("Invalid schema required fields");
        for (const key of ['properties', '$defs', 'definitions']) {
          if (entry[key] === undefined) continue;
          if (!entry[key] || typeof entry[key] !== 'object' || Array.isArray(entry[key])) throw new TypeError("Invalid schema properties");
          for (const child of Object.values(object(entry[key]))) checkSchema(child);
        }
        if (entry.items !== undefined) checkSchema(entry.items);
        if (entry.additionalProperties !== undefined && typeof entry.additionalProperties !== 'boolean') checkSchema(entry.additionalProperties);
        for (const key of ['anyOf', 'oneOf', 'allOf']) {
          if (entry[key] === undefined) continue;
          if (!Array.isArray(entry[key]) || !entry[key].length) throw new TypeError("Invalid schema alternatives");
          for (const child of entry[key]) checkSchema(child);
        }
      };
      checkSchema(schema);
      options.response_format = { type: 'json_schema', json_schema: {
        name: definition.name, schema,
        ...(definition.strict === undefined ? {} : { strict: definition.strict }),
        ...(definition.description === undefined ? {} : { description: definition.description }),
      } };
    } else throw new TypeError("Unsupported response format");
  }
  return options;
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  if (!reader) return {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 100 * 1024 * 1024) {
      await reader.cancel();
      throw new RangeError('Request too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return object(JSON.parse(text + decoder.decode()));
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond('Method not allowed', 405);
  const authorization = request.headers.get('Authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  if (!token) return respond('請先登入系統。', 401);

  try {
    const caller = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      db: { schema: Deno.env.get('APP_DB_SCHEMA') ?? 'workspace' },
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let body: Record<string, unknown>;
    try { body = await readBody(request); }
    catch (error) { return respond(error instanceof RangeError ? '附件與對話內容超過 100MB。' : '請求格式錯誤。', error instanceof RangeError ? 413 : 400); }
    if (!['models', 'chat'].includes(String(body.operation))) return respond('不支援的操作。', 400);

    const savedKey = typeof body.apiKeyId === 'string' && body.apiKeyId.trim() !== '';
    // The gateway verifies JWTs; this RPC checks the linked active account and current workspace access.
    const { data: permitted, error: permissionError } = await caller.rpc('current_user_can_workspace', {
      p_workspace: 'ai-chat', p_action: savedKey ? 'view' : 'edit',
    });
    if (permissionError || permitted !== true) return respond('沒有使用此 AI 服務的權限。', 403);

    let apiKey = '', model = '';
    const chat = object(body.request);
    if (savedKey) {
      const { data: key, error } = await caller.from('api_keys')
        .select('api_key,is_active,expires_at,permissions').eq('id', body.apiKeyId).maybeSingle();
      if (error || !key || !key.is_active || (key.expires_at && !(Date.parse(key.expires_at) > Date.now())))
        return respond('OpenAI 金鑰不可用或已到期。', 403);
      const metadata = object(object(key.permissions).metadata);
      if (String(metadata.provider).trim().toLowerCase() !== 'openai'
        || String(metadata.baseUrl).trim().replace(/\/+$/, '') !== 'https://api.openai.com/v1')
        return respond('此服務只接受官方 OpenAI 金鑰設定。', 400);
      apiKey = typeof key.api_key === 'string' ? key.api_key.trim() : '';
      model = typeof metadata.model === 'string' ? metadata.model.trim() : '';
      if (body.operation === 'chat' && chat.model !== model) {
        // GPT-5.4 remains the stored default. The official key can also be used for a single explicitly selected Sol request.
        if (model !== 'gpt-5.4' || chat.model !== 'gpt-6.1-sol') return respond('模型與已儲存的設定不一致。', 400);
        model = chat.model;
      }
    } else {
      apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      model = typeof chat.model === 'string' ? chat.model.trim() : '';
    }
    if (!apiKey || apiKey.length > 1024 || /[\r\n]/.test(apiKey)) return respond('請提供有效的 OpenAI 金鑰。', 400);
    if (body.operation === 'chat' && (!model || model.length > 160 || !Array.isArray(chat.messages) || !chat.messages.length || chat.messages.length > 100))
      return respond('請檢查模型與對話內容。', 400);

    let options: Record<string, unknown> = {};
    if (body.operation === 'chat') {
      try { options = generationOptions(chat); }
      catch { return respond('AI 分析參數格式不正確，請調整模型設定後重試。', 400); }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const upstream = await fetch(`https://api.openai.com/v1/${body.operation === 'models' ? 'models' : 'chat/completions'}`, {
        method: body.operation === 'models' ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: body.operation === 'models' ? undefined : JSON.stringify({ model, messages: chat.messages, ...options }),
        signal: controller.signal,
        redirect: 'error',
      });
      const text = (await upstream.text()).split(apiKey).join('[REDACTED]');
      const headers = new Headers({ ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      for (const name of ['retry-after', 'x-request-id']) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(text, { status: upstream.status, headers });
    } catch {
      return respond(controller.signal.aborted ? 'OpenAI 回應逾時，請稍後重試。' : '系統後端暫時無法連到 OpenAI，請稍後重試。', controller.signal.aborted ? 504 : 502);
    } finally { clearTimeout(timer); }
  } catch {
    return respond('OpenAI 服務暫時不可用，請稍後重試。', 503);
  }
});
