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
    const { data: identity, error: authError } = await caller.auth.getUser(token);
    if (authError || !identity.user || identity.user.is_anonymous) return respond('登入已失效，請重新登入。', 401);
    let body: Record<string, unknown>;
    try { body = await readBody(request); }
    catch (error) { return respond(error instanceof RangeError ? '附件與對話內容超過 100MB。' : '請求格式錯誤。', error instanceof RangeError ? 413 : 400); }
    if (!['models', 'chat'].includes(String(body.operation))) return respond('不支援的操作。', 400);

    const savedKey = typeof body.apiKeyId === 'string' && body.apiKeyId.trim() !== '';
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
      if (body.operation === 'chat' && chat.model !== model) return respond('模型與已儲存的設定不一致。', 400);
    } else {
      apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      model = typeof chat.model === 'string' ? chat.model.trim() : '';
    }
    if (!apiKey || apiKey.length > 1024 || /[\r\n]/.test(apiKey)) return respond('請提供有效的 OpenAI 金鑰。', 400);
    if (body.operation === 'chat' && (!model || model.length > 160 || !Array.isArray(chat.messages) || !chat.messages.length || chat.messages.length > 100))
      return respond('請檢查模型與對話內容。', 400);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const upstream = await fetch(`https://api.openai.com/v1/${body.operation === 'models' ? 'models' : 'chat/completions'}`, {
        method: body.operation === 'models' ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: body.operation === 'models' ? undefined : JSON.stringify({ model, messages: chat.messages }),
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
