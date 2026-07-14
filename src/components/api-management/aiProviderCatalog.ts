export type AiProviderPresetId =
  | "gemini"
  | "openai"
  | "anthropic"
  | "openai-compatible";

export type AiProviderProtocol = "gemini" | "openai" | "anthropic";

export interface AiProviderPreset {
  id: AiProviderPresetId;
  label: string;
  shortLabel: string;
  description: string;
  providerValue: string;
  protocol: AiProviderProtocol;
  baseUrl: string;
  defaultModel: string;
  keyPlaceholder: string;
}

export interface ProviderMessageImage {
  data: string;
  mimeType: string;
}

export interface ProviderChatMessage {
  role: "assistant" | "system" | "user";
  text: string;
  images?: ProviderMessageImage[];
}

export interface ProviderHttpRequest {
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
  method: "GET" | "POST";
}

export interface ProviderChatResult {
  text: string;
  images: ProviderMessageImage[];
}

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    shortLabel: "Gemini",
    description: "Google AI Studio 金鑰，支援圖片與文件分析。",
    providerValue: "gemini",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    keyPlaceholder: "貼上 Gemini API Key",
  },
  {
    id: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    description: "OpenAI 平台金鑰，系統會讀取帳號可用模型。",
    providerValue: "openai",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.2",
    keyPlaceholder: "貼上 OpenAI API Key",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    shortLabel: "Claude",
    description: "Anthropic Console 金鑰，使用 Claude Messages API。",
    providerValue: "anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    keyPlaceholder: "貼上 Anthropic API Key",
  },
  {
    id: "openai-compatible",
    label: "OpenAI 相容／自訂",
    shortLabel: "自訂",
    description: "OpenRouter、Groq、公司代理或其他 OpenAI 相容服務。",
    providerValue: "openai-compatible",
    protocol: "openai",
    baseUrl: "",
    defaultModel: "",
    keyPlaceholder: "貼上服務商提供的 API Key",
  },
] as const;

function normalizeProviderValue(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s_]+/g, "-") ?? "";
}

export function resolveAiProviderPreset(
  value: string | null | undefined,
): AiProviderPreset {
  const normalized = normalizeProviderValue(value);

  if (["gemini", "google", "google-ai", "google-gemini"].includes(normalized)) {
    return AI_PROVIDER_PRESETS[0];
  }

  if (normalized === "openai") {
    return AI_PROVIDER_PRESETS[1];
  }

  if (["anthropic", "claude", "anthropic-claude"].includes(normalized)) {
    return AI_PROVIDER_PRESETS[2];
  }

  return AI_PROVIDER_PRESETS[3];
}

export function getAiProviderPreset(id: AiProviderPresetId) {
  return (
    AI_PROVIDER_PRESETS.find((preset) => preset.id === id) ??
    AI_PROVIDER_PRESETS[3]
  );
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function createAuthHeaders(protocol: AiProviderProtocol, apiKey: string) {
  const normalizedKey = apiKey.trim();

  if (protocol === "gemini") {
    return { "x-goog-api-key": normalizedKey };
  }

  if (protocol === "anthropic") {
    return {
      "anthropic-dangerous-direct-browser-access": "true",
      "anthropic-version": "2023-06-01",
      "x-api-key": normalizedKey,
    };
  }

  return { Authorization: `Bearer ${normalizedKey}` };
}

export function buildProviderModelRequest(input: {
  provider: string;
  baseUrl: string;
  apiKey: string;
}): ProviderHttpRequest {
  const preset = resolveAiProviderPreset(input.provider);
  const baseUrl = trimTrailingSlash(input.baseUrl || preset.baseUrl);
  const suffix = preset.protocol === "anthropic" ? "/models?limit=1000" :
    preset.protocol === "gemini" ? "/models?pageSize=1000" : "/models";

  return {
    method: "GET",
    url: `${baseUrl}${suffix}`,
    headers: createAuthHeaders(preset.protocol, input.apiKey),
  };
}

function readArray(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== "object") return [];
  const candidate = (value as Record<string, unknown>)[key];
  return Array.isArray(candidate) ? candidate : [];
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== "object") return "";
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : "";
}

export function parseProviderModels(provider: string, payload: unknown) {
  const preset = resolveAiProviderPreset(provider);
  const records = readArray(payload, preset.protocol === "gemini" ? "models" : "data");
  const models = records.flatMap((record) => {
    const id = readString(record, preset.protocol === "gemini" ? "name" : "id");
    if (!id) return [];

    if (preset.protocol === "gemini") {
      const generationMethods = readArray(record, "supportedGenerationMethods");
      if (!generationMethods.includes("generateContent")) return [];
      return [id.replace(/^models\//, "")];
    }

    return [id];
  });

  const nonChatPattern = /(?:embedding|moderation|whisper|transcri|dall-e|image|audio|realtime|speech|tts)/i;
  return [...new Set(models)].sort((left, right) => {
    const rankDifference = Number(nonChatPattern.test(left)) - Number(nonChatPattern.test(right));
    return rankDifference || left.localeCompare(right);
  });
}

function createGeminiParts(message: ProviderChatMessage) {
  return [
    ...(message.text ? [{ text: message.text }] : []),
    ...(message.images ?? []).map((image) => ({
      inlineData: {
        data: image.data,
        mimeType: image.mimeType,
      },
    })),
  ];
}

function createOpenAiContent(message: ProviderChatMessage) {
  if (!message.images?.length) return message.text;

  return [
    ...(message.text ? [{ type: "text", text: message.text }] : []),
    ...message.images.map((image) => ({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    })),
  ];
}

function createAnthropicContent(message: ProviderChatMessage) {
  if (!message.images?.length) return message.text;

  return [
    ...(message.text ? [{ type: "text", text: message.text }] : []),
    ...message.images.map((image) => ({
      type: "image",
      source: {
        type: "base64",
        data: image.data,
        media_type: image.mimeType,
      },
    })),
  ];
}

export function buildProviderChatRequest(input: {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ProviderChatMessage[];
}): ProviderHttpRequest {
  const preset = resolveAiProviderPreset(input.provider);
  const baseUrl = trimTrailingSlash(input.baseUrl || preset.baseUrl);
  const headers = {
    ...createAuthHeaders(preset.protocol, input.apiKey),
    "Content-Type": "application/json",
  };

  if (preset.protocol === "gemini") {
    const systemText = input.messages
      .filter((message) => message.role === "system")
      .map((message) => message.text)
      .filter(Boolean)
      .join("\n");
    const body: Record<string, unknown> = {
      contents: input.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: createGeminiParts(message),
        })),
    };
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }

    return {
      method: "POST",
      url: `${baseUrl}/models/${input.model.trim()}:generateContent`,
      headers,
      body,
    };
  }

  if (preset.protocol === "anthropic") {
    const system = input.messages
      .filter((message) => message.role === "system")
      .map((message) => message.text)
      .filter(Boolean)
      .join("\n");
    const body: Record<string, unknown> = {
      model: input.model.trim(),
      max_tokens: 4096,
      messages: input.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role,
          content: createAnthropicContent(message),
        })),
    };
    if (system) body.system = system;

    return {
      method: "POST",
      url: `${baseUrl}/messages`,
      headers,
      body,
    };
  }

  return {
    method: "POST",
    url: `${baseUrl}/chat/completions`,
    headers,
    body: {
      model: input.model.trim(),
      messages: input.messages.map((message) => ({
        role: message.role,
        content: createOpenAiContent(message),
      })),
    },
  };
}

export function parseProviderChatResponse(
  provider: string,
  payload: unknown,
): ProviderChatResult {
  const protocol = resolveAiProviderPreset(provider).protocol;

  if (protocol === "gemini") {
    const candidate = readArray(payload, "candidates")[0];
    const content = candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>).content
      : null;
    const parts = readArray(content, "parts");
    return {
      text: parts.map((part) => readString(part, "text")).filter(Boolean).join("\n"),
      images: parts.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const inlineData = (part as Record<string, unknown>).inlineData;
        const data = readString(inlineData, "data");
        const mimeType = readString(inlineData, "mimeType");
        return data && mimeType ? [{ data, mimeType }] : [];
      }),
    };
  }

  if (protocol === "anthropic") {
    return {
      text: readArray(payload, "content")
        .map((part) => readString(part, "text"))
        .filter(Boolean)
        .join("\n"),
      images: [],
    };
  }

  const choice = readArray(payload, "choices")[0];
  const message = choice && typeof choice === "object"
    ? (choice as Record<string, unknown>).message
    : null;
  const content = message && typeof message === "object"
    ? (message as Record<string, unknown>).content
    : "";
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => readString(part, "text")).filter(Boolean).join("\n")
      : "";

  return { text, images: [] };
}

export function redactSensitiveText(value: string, secrets: string[] = []) {
  return secrets
    .map((secret) => secret.trim())
    .filter((secret) => secret.length >= 4)
    .sort((left, right) => right.length - left.length)
    .reduce(
      (current, secret) => current.split(secret).join("[REDACTED]"),
      value,
    );
}

export function getProviderErrorMessage(
  payload: unknown,
  status?: number,
  secrets: string[] = [],
) {
  if (payload && typeof payload === "object") {
    const error = (payload as Record<string, unknown>).error;
    const nestedMessage = readString(error, "message");
    if (nestedMessage) return redactSensitiveText(nestedMessage, secrets);
    const message = readString(payload, "message");
    if (message) return redactSensitiveText(message, secrets);
  }

  return status ? `AI API 呼叫失敗（HTTP ${status}）` : "AI API 呼叫失敗";
}
