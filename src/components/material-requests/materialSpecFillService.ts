import { supabase } from "@/integrations/supabase/client";
import { withReadDeadline } from "@/lib/readDeadline";
import { buildApiKeyPermissions, normalizeApiKeyPermissions, type ApiKeyRecord } from "../api-management/apiKeyHelpers";
import { loadApiKeyModelTargets } from "../api-management/apiKeyModelTargets";
import { GEMINI_FREE_MODEL_PROFILES, buildProviderChatRequest, parseProviderChatResponse, redactSensitiveText, resolveAiProviderPreset, type ProviderChatMessage } from "../api-management/aiProviderCatalog";
import { trackedProviderFetch } from "../api-management/aiUsageTelemetry";
import { classifyAiFailure } from "../api-management/aiRequestRecovery";
import type { MaterialSpecDocument, MaterialWorkbookRecord } from "./materialRequestUtils";
import { MATERIAL_SPEC_BUCKET } from "./materialSpecDocuments";
import { assertSpecFillFollowupCoverage, assertSpecFillResponseComplete, assertSpecFillTextCitations, buildSpecFillPrompt, buildSpecFillQuestionJsonSchema, buildSpecFillRequestOptions, parseSpecFillQuestion, parseSpecFillTables, SPEC_FILL_INSTRUCTIONS, SPEC_FILL_QUESTION_INSTRUCTIONS, type SpecFillPrecision, type SpecFillResult, type SpecFillSource, type SpecFillTable, type SpecFillTurn } from "./materialSpecFill";
import { canReadSpecForFill, prepareSpecFillSources } from "./materialSpecFillSources";
export { canReadSpecForFill, SPEC_FILL_ACCEPT } from "./materialSpecFillSources";
export type { SpecFillCitation, SpecFillPrecision } from "./materialSpecFill";

export const SPEC_FILL_MAX_BYTES = 18 * 1024 * 1024;
export const SPEC_FILL_MAX_PHOTOS = 20;
export interface SpecFillModel { id: string; label: string; record: ApiKeyRecord }
export interface SpecFillInput { id: string; name: string; blob: Blob }

export async function loadSpecFillModels({ imagesOnly = false }: { imagesOnly?: boolean } = {}): Promise<SpecFillModel[]> {
  const { data, error } = await withReadDeadline(signal => supabase.from("api_keys").select("*").eq("is_active", true).order("created_at", { ascending: false }).abortSignal(signal), 15000);
  if (error) throw new Error("無法讀取已設定的 AI 服務，請確認帳號權限或稍後重試。");
  return (await Promise.all((data ?? []).filter(record => record.is_active && (!record.expires_at || Date.parse(record.expires_at) > Date.now())).map(async record => {
    const { metadata, read, write } = normalizeApiKeyPermissions(record.permissions);
    if (!read || !metadata.provider.trim() || !metadata.model.trim() || !metadata.baseUrl.trim()) return [];
    // PDF tools send rendered images; native SPEC documents retain their PDF protocol restriction.
    if (!imagesOnly && resolveAiProviderPreset(metadata.provider).id === "openai-compatible") return [];
    if (imagesOnly) return (await loadApiKeyModelTargets([record], [metadata.model, ...GEMINI_FREE_MODEL_PROFILES.map(item => item.id)])).map(target => ({
      id: target.model === metadata.model ? record.id : target.id, label: `${record.key_name} · ${target.model}`,
      record: target.model === metadata.model ? record : { ...record, permissions: buildApiKeyPermissions({ read, write, metadata: { ...metadata, model: target.model } }, record.permissions) },
    }));
    return [{ id: record.id, label: `${record.key_name} · ${metadata.model}`, record }];
  }))).flat();
}

export async function downloadSpecForFill(document: MaterialSpecDocument, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  if (!canReadSpecForFill(document.name)) throw new Error(`${document.name} 無法判讀，請選擇 PDF、圖片、文字、RAR 或 STEP。`);
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
  const [table] = await analyzeSpecFillPhotos({ part, photos: [photo], sources, model, note, signal });
  return table;
}

type SpecFillPart = Pick<MaterialWorkbookRecord, "manufacturerPartNumber" | "manufacturer" | "name" | "refDes">;
interface SpecFillConversationInput {
  part: SpecFillPart;
  photos: SpecFillInput[]; sources: SpecFillInput[]; model: SpecFillModel; note: string; signal: AbortSignal;
  questionImages?: SpecFillInput[];
  history?: SpecFillTurn[]; question?: string;
  precision?: SpecFillPrecision;
}
export type SpecFillQuestionInput = Omit<SpecFillConversationInput, "part" | "photos" | "note" | "question"> & { part?: SpecFillPart; photos?: SpecFillInput[]; note?: string; question: string };
export async function analyzeSpecFillPhotos(input: SpecFillConversationInput): Promise<SpecFillTable[]> {
  return (await analyzeSpecFillConversation(input)).tables;
}

export async function analyzeSpecFillConversation(input: SpecFillConversationInput) {
  return runSpecFillRequest(input, "fill");
}

/** Standalone questions can cite attached SPEC screenshots. */
export async function askSpecFillQuestion(input: SpecFillQuestionInput) {
  return runSpecFillRequest({ ...input, photos: input.photos ?? [], note: input.note ?? "" }, "question");
}

async function runSpecFillRequest({ part, photos, sources, model, note, signal, questionImages = [], history = [], question = "", precision = "standard" }: Omit<SpecFillConversationInput, "part"> & { part?: SpecFillPart }, mode: "fill" | "question") {
  signal.throwIfAborted();
  const screenshotSources = mode === "question" && !photos.length ? questionImages : [];
  if (history.length > 12 || JSON.stringify(history).length > 240000) throw new Error("對話已達本次上下文容量，請重新開始對話；既有結果仍可複製與下載。");
  if (question.length > 4000) throw new Error("本次問題超過 4000 字，請縮短後重試。");
  if (mode === "question" && !question.trim() && !questionImages.length) throw new Error("請輸入要從 SPEC 查核的問題，或加入問題圖片。");
  if (note.length > 4000) throw new Error("補充查找條件超過 4000 字，請縮短後重試。");
  if (!part?.manufacturerPartNumber.trim() && !screenshotSources.length) throw new Error("請先確認此料件的完整廠商料號（MPN）。");
  if ((mode === "fill" && !photos.length) || photos.length > SPEC_FILL_MAX_PHOTOS || photos.some(photo => !/\.(png|jpe?g|webp)$/i.test(photo.name))) throw new Error(`請選擇 1–${SPEC_FILL_MAX_PHOTOS} 張表格照片（PNG、JPG 或 WEBP），可分批分析，不必壓縮。`);
  if (new Set(photos.map(photo => photo.id)).size !== photos.length) throw new Error("照片識別重複，請重新選擇照片。");
  if (questionImages.length > SPEC_FILL_MAX_PHOTOS || questionImages.some(image => !/\.(png|jpe?g|webp)$/i.test(image.name))) throw new Error(`問題圖片最多 ${SPEC_FILL_MAX_PHOTOS} 張，請使用 PNG、JPG 或 WEBP。`);
  if (new Set(questionImages.map(image => image.id)).size !== questionImages.length) throw new Error("問題圖片識別重複，請重新選擇圖片。");
  if ((!sources.length && !screenshotSources.length) || sources.length > 20) throw new Error("請選擇 1–20 份此料件的 SPEC，可分次分析，不必壓縮。");
  const images = [...photos, ...questionImages];
  if ([...images, ...sources].reduce((sum, input) => sum + input.blob.size, 0) > SPEC_FILL_MAX_BYTES) throw new Error("本次檔案合計超過 18 MB，請分次選擇相關 SPEC 或頁面分析，不必壓縮。");
  const { metadata, read } = normalizeApiKeyPermissions(model.record.permissions);
  if (!read) throw new Error("目前帳號無法使用這項 AI 服務，請重新選擇或聯絡管理員。");
  const provider = resolveAiProviderPreset(metadata.provider).id;
  if (provider === "openai-compatible" || !metadata.model.trim() || !metadata.baseUrl.trim()) throw new Error("請選擇已設定圖片與 PDF 判讀的 Gemini、OpenAI 或 Claude 服務。");
  if (!model.record.is_active || (model.record.expires_at && Date.parse(model.record.expires_at) <= Date.now())) throw new Error("AI 服務已停用或到期，請重新選擇。");
  if (new Set(sources.map(source => source.id)).size !== sources.length) throw new Error("SPEC 識別重複，請重新選擇附件。");
  const prepared = sources.length ? await prepareSpecFillSources(sources, signal) : { inputs: [], warnings: [] };
  if ([...images, ...prepared.inputs].reduce((sum, input) => sum + input.blob.size, 0) > SPEC_FILL_MAX_BYTES) throw new Error("SPEC 解壓後與圖片合計超過 18 MB，請選擇較少文件。");
  const catalogue: SpecFillSource[] = [...prepared.inputs, ...screenshotSources].map(({ id, name }) => ({ id, name }));
  if (new Set(catalogue.map(source => source.id)).size !== catalogue.length) throw new Error("SPEC 與問題圖片識別重複，請重新選擇附件。");
  const templates = photos.map(({ id, name }) => ({ id, name }));
  const instruction = mode === "fill" ? SPEC_FILL_INSTRUCTIONS : SPEC_FILL_QUESTION_INSTRUCTIONS;
  const partIdentity = part && { manufacturerPartNumber: part.manufacturerPartNumber, manufacturer: part.manufacturer, name: part.name, refDes: part.refDes };
  const prompt = mode === "fill" && part ? buildSpecFillPrompt(part, catalogue, note, templates)
    : `指定料件（僅用來識別，不是規格證據）：${partIdentity ? JSON.stringify(partIdentity) : "未指定，僅核對圖片可見內容，不推測料件型號。"}\n本次來源目錄：${JSON.stringify(catalogue)}\n使用者補充：${note}\n本次只回答問題，不產生或變更表格。`;
  const messages: ProviderChatMessage[] = [{ role: "system", text: instruction + (precision === "high" ? "\n本次為深入核對：優先比對型號後綴、條件與來源完整性；只提供簡潔查核結論，不輸出內部思考過程。" : "") }, { role: "user", text: prompt }];
  const sourceText = new Map<string, string>();
  for (const photo of photos) {
    signal.throwIfAborted();
    const template = await encodeSource(photo);
    messages.push({ role: "user", text: `要填寫的表格照片（模板，不是 SPEC 數據來源）\ntemplateId=${photo.id}; name=${photo.name}`, images: [{ data: template.data, mimeType: template.mimeType }] });
  }
  for (const source of prepared.inputs) {
    signal.throwIfAborted();
    const encoded = await encodeSource(source);
    if (encoded.mimeType === "text/plain") sourceText.set(source.id, encoded.text);
    messages.push({ role: "user", text: `SPEC sourceId=${source.id}; name=${source.name}\n${encoded.text}`,
      ...(encoded.mimeType === "application/pdf" ? { documents: [{ data: encoded.data, mimeType: encoded.mimeType, name: source.name }] } : encoded.mimeType.startsWith("image/") ? { images: [{ data: encoded.data, mimeType: encoded.mimeType }] } : {}) });
  }
  for (const [index, image] of questionImages.entries()) {
    signal.throwIfAborted();
    const encoded = await encodeSource(image);
    const text = screenshotSources.length ? `問題截圖來源 sourceId=${image.id}; name=${image.name}`
      : `問題參考圖 ${index + 1}（僅協助理解問題，不是 SPEC 數據來源）\nname=${image.name}`;
    messages.push({ role: "user", text, images: [{ data: encoded.data, mimeType: encoded.mimeType }] });
  }
  for (const turn of history) messages.push({ role: "user", text: turn.question }, { role: "assistant", text: JSON.stringify({ reply: turn.reply, tables: turn.tables }) });
  const asked = question.trim() || (mode === "question" && questionImages.length ? "請整理圖片可核對的規格與條件，並指出仍待確認的資料。" : "");
  if (asked) messages.push({ role: "user", text: `本次提問：${asked}` });
  signal.throwIfAborted();
  const request = buildProviderChatRequest({ provider: metadata.provider, baseUrl: metadata.baseUrl, apiKey: model.record.api_key, model: metadata.model, messages });
  Object.assign(request.body!, buildSpecFillRequestOptions(provider, metadata.model, precision, templates, catalogue, mode === "question" ? buildSpecFillQuestionJsonSchema(catalogue) : undefined));
  if (provider === "openai" && precision === "high") {
    // Keep small form text legible in this task without changing general chat.
    const outgoing = request.body!.messages as Array<{ content: string | Array<{ type?: string; image_url?: { url: string; detail?: string } }> }>;
    for (const message of outgoing) if (Array.isArray(message.content)) for (const part of message.content)
      if (part.type === "image_url" && part.image_url) part.image_url.detail = "high";
  }
  const response = await trackedProviderFetch({ apiKeyId: model.record.id, provider: metadata.provider, model: metadata.model, source: "ai-chat", attemptNumber: 1, url: request.url, init: { method: request.method, headers: request.headers, body: JSON.stringify(request.body), signal }, timeoutMs: precision === "high" ? 120000 : 90000 });
  signal.throwIfAborted();
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error("AI 服務回應無法讀取，請稍後重試。"); }
  if (!response.ok) throw classifyAiFailure(response.status, payload, response.headers.get("Retry-After"));
  assertSpecFillResponseComplete(provider, payload);
  const parsed = parseProviderChatResponse(metadata.provider, payload);
  const safe = redactSensitiveText(parsed.text, [model.record.api_key]);
  if (mode === "question") {
    const answer = parseSpecFillQuestion(safe, catalogue);
    assertSpecFillTextCitations(answer.citations, sourceText);
    return { ...answer, tables: [] as SpecFillTable[], sources: catalogue, preparedSources: prepared.inputs, warnings: prepared.warnings };
  }
  const tables = parseSpecFillTables(safe, catalogue, templates);
  assertSpecFillTextCitations(tables.flatMap(table => table.rows.flatMap(row => row.flatMap(cell => cell.kind === "source" ? [{ sourceId: cell.sourceId!, page: cell.page!, quote: cell.quote! }] : []))), sourceText);
  const previousTableTurn = [...history].reverse().find(turn => turn.tables.length > 0);
  if (previousTableTurn) assertSpecFillFollowupCoverage(tables, previousTableTurn.tables);
  const json = JSON.parse(safe.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  if (typeof json.reply === "string" && json.reply.length > 64000) throw new Error("AI 回覆超過本次顯示容量，請縮小問題範圍；原有結果已保留。");
  const reply = typeof json.reply === "string" && json.reply.trim() ? json.reply : "已依所選 SPEC 整理表格，請核對來源與待確認項目。";
  return { tables, reply, citations: [], sources: catalogue, preparedSources: prepared.inputs, warnings: prepared.warnings };
}
