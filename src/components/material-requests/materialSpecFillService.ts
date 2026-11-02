import { supabase } from "@/integrations/supabase/client";
import { withReadDeadline } from "@/lib/readDeadline";
import { normalizeApiKeyPermissions, type ApiKeyRecord } from "../api-management/apiKeyHelpers";
import { buildProviderChatRequest, parseProviderChatResponse, redactSensitiveText, resolveAiProviderPreset, type ProviderChatMessage } from "../api-management/aiProviderCatalog";
import { trackedProviderFetch } from "../api-management/aiUsageTelemetry";
import { classifyAiFailure } from "../api-management/aiRequestRecovery";
import type { MaterialSpecDocument, MaterialWorkbookRecord } from "./materialRequestUtils";
import { MATERIAL_SPEC_BUCKET } from "./materialSpecDocuments";
import { buildSpecFillPrompt, parseSpecFillResult, SPEC_FILL_INSTRUCTIONS, type SpecFillResult, type SpecFillSource } from "./materialSpecFill";

export const SPEC_FILL_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.tsv,.md";
export const SPEC_FILL_MAX_BYTES = 18 * 1024 * 1024;
export interface SpecFillModel { id: string; label: string; record: ApiKeyRecord }
export interface SpecFillInput { id: string; name: string; blob: Blob }
export function canReadSpecForFill(name: string) { return /\.(pdf|png|jpe?g|webp|txt|csv|tsv|md)$/i.test(name); }

export async function loadSpecFillModels(): Promise<SpecFillModel[]> {
  const { data, error } = await withReadDeadline(signal => supabase.from("api_keys").select("*").eq("is_active", true).order("created_at", { ascending: false }).abortSignal(signal), 15000);
  if (error) throw new Error("無法讀取已設定的 AI 服務，請確認帳號權限或稍後重試。");
  return (data ?? []).filter(record => record.is_active && (!record.expires_at || Date.parse(record.expires_at) > Date.now())).flatMap(record => {
    const { metadata, read } = normalizeApiKeyPermissions(record.permissions);
    if (!read || !metadata.provider.trim() || !metadata.model.trim() || !metadata.baseUrl.trim()) return [];
    // Custom compatible endpoints have no verified vision/document contract.
    if (resolveAiProviderPreset(metadata.provider).id === "openai-compatible") return [];
    return [{ id: record.id, label: `${record.key_name} · ${metadata.model}`, record }];
  });
}

export async function downloadSpecForFill(document: MaterialSpecDocument, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  if (!canReadSpecForFill(document.name)) throw new Error(`${document.name} 無法直接判讀，請另外選擇 PDF、圖片或文字版 SPEC。`);
  if (document.size > SPEC_FILL_MAX_BYTES) throw new Error(`${document.name} 超過本次 AI 分析容量，請選擇相關頁面的 PDF 或圖片。原附件仍可正常下載。`);
  // Uses the signed-in client's existing Storage RLS. Never use a public URL or service role.
  const { data, error } = await withReadDeadline(() => supabase.storage.from(MATERIAL_SPEC_BUCKET).download(document.path), 20000);
  signal.throwIfAborted();
  if (error || !data) throw new Error(`無法讀取 ${document.name}，請確認附件權限後重試。`);
  return data;
}

async function encodeSource(input: SpecFillInput) {
  const bytes = new Uint8Array(await input.blob.arrayBuffer());
  if (!bytes.length || bytes.length > SPEC_FILL_MAX_BYTES) throw new Error(`${input.name} 是空檔或超過本次 AI 分析容量。請選擇相關頁面後重試。`);
  const extension = input.name.split(".").pop()?.toLowerCase();
  const mimeType = extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : /jpe?g/.test(extension ?? "") ? "image/jpeg" : "text/plain";
  if (!canReadSpecForFill(input.name)) throw new Error(`不支援直接判讀 ${input.name}，請選擇 PDF、圖片或文字版 SPEC。`);
  if (mimeType === "application/pdf" && !/%PDF-\d\.\d/.test(new TextDecoder().decode(bytes.slice(0, 1024)))) throw new Error(`${input.name} 不是有效的 PDF。`);
  if (mimeType === "text/plain") {
    if (bytes.length > 200000) throw new Error(`${input.name} 文字內容過長，請選擇與料件相關的段落。`);
    return { text: new TextDecoder().decode(bytes), mimeType, data: "" };
  }
  const isImage = mimeType.startsWith("image/");
  if (isImage) {
    const valid = mimeType === "image/png" ? [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)
      : mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
    if (!valid) throw new Error(`${input.name} 不是有效圖片，請重新選擇 PNG、JPG 或 WEBP。`);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return { data: btoa(binary), mimeType, text: "" };
}

export async function analyzeSpecFill({ part, photo, sources, model, note, signal }: {
  part: Pick<MaterialWorkbookRecord, "manufacturerPartNumber" | "manufacturer" | "name" | "refDes">;
  photo: SpecFillInput; sources: SpecFillInput[]; model: SpecFillModel; note: string; signal: AbortSignal;
}): Promise<SpecFillResult> {
  signal.throwIfAborted();
  if (!part.manufacturerPartNumber.trim()) throw new Error("請先確認此料件的完整廠商料號（MPN）。");
  if (!/\.(png|jpe?g|webp)$/i.test(photo.name)) throw new Error("請貼上或選擇要填寫的表格照片。");
  if (!sources.length || sources.length > 20) throw new Error("請選擇 1–20 份此料件的 SPEC，可分次分析，不必壓縮。");
  if ([photo, ...sources].reduce((sum, input) => sum + input.blob.size, 0) > SPEC_FILL_MAX_BYTES) throw new Error("本次檔案合計超過 18 MB，請分次選擇相關 SPEC 或頁面分析，不必壓縮。");
  const metadata = normalizeApiKeyPermissions(model.record.permissions).metadata;
  if (!model.record.is_active || (model.record.expires_at && Date.parse(model.record.expires_at) <= Date.now())) throw new Error("AI 服務已停用或到期，請重新選擇。");
  const catalogue: SpecFillSource[] = sources.map(source => ({ id: source.id, name: source.name }));
  if (new Set(catalogue.map(source => source.id)).size !== sources.length) throw new Error("SPEC 識別重複，請重新選擇附件。");
  const messages: ProviderChatMessage[] = [{ role: "system", text: SPEC_FILL_INSTRUCTIONS }, { role: "user", text: buildSpecFillPrompt(part, catalogue, note) }];
  const template = await encodeSource(photo);
  messages.push({ role: "user", text: "要填寫的表格照片（模板，不是 SPEC 數據來源）", images: [{ data: template.data, mimeType: template.mimeType }] });
  for (const source of sources) {
    signal.throwIfAborted();
    const encoded = await encodeSource(source);
    messages.push({ role: "user", text: `SPEC sourceId=${source.id}; name=${source.name}\n${encoded.text}`,
      ...(encoded.mimeType === "application/pdf" ? { documents: [{ data: encoded.data, mimeType: encoded.mimeType, name: source.name }] } : encoded.mimeType.startsWith("image/") ? { images: [{ data: encoded.data, mimeType: encoded.mimeType }] } : {}) });
  }
  signal.throwIfAborted();
  const request = buildProviderChatRequest({ provider: metadata.provider, baseUrl: metadata.baseUrl, apiKey: model.record.api_key, model: metadata.model, messages });
  const response = await trackedProviderFetch({ apiKeyId: model.id, provider: metadata.provider, model: metadata.model, source: "ai-chat", attemptNumber: 1, url: request.url, init: { method: request.method, headers: request.headers, body: JSON.stringify(request.body), signal }, timeoutMs: 90000 });
  signal.throwIfAborted();
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error("AI 服務回應無法讀取，請稍後重試。"); }
  if (!response.ok) throw classifyAiFailure(response.status, payload, response.headers.get("Retry-After"));
  const parsed = parseProviderChatResponse(metadata.provider, payload);
  return parseSpecFillResult(redactSensitiveText(parsed.text, [model.record.api_key]), catalogue);
}
