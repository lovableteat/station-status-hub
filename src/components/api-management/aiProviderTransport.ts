import { supabase } from '@/integrations/supabase/client';
import { AiRequestFailure } from './aiRequestRecovery';

export async function fetchAiProvider(provider: string, url: string, init: RequestInit, apiKeyId?: string | null): Promise<Response> {
  const officialOpenAi = provider.trim().toLowerCase() === 'openai'
    && ['https://api.openai.com/v1/models', 'https://api.openai.com/v1/chat/completions'].includes(url);
  if (!officialOpenAi) return fetch(url, init);

  const operation = url.endsWith('/models') ? 'models' : 'chat';
  const { data, error, response } = await supabase.functions.invoke('openai-proxy', {
    signal: init.signal ?? undefined,
    body: {
      operation,
      apiKeyId: apiKeyId || undefined,
      apiKey: apiKeyId ? undefined : new Headers(init.headers).get('Authorization')?.replace(/^Bearer\s+/i, ''),
      request: operation === 'chat' && typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    },
  });
  if (error) {
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (response) return response;
    throw new AiRequestFailure('無法連到系統的 OpenAI 服務，請檢查系統連線後重試。', 'network');
  }
  return new Response(JSON.stringify(data), {
    status: response?.status ?? 200,
    headers: response?.headers ?? { 'Content-Type': 'application/json' },
  });
}
