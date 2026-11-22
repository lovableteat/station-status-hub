import { withReadDeadline } from "@/lib/readDeadline";
import { buildApiKeyModelTargets, isOpenAiOnDemandTarget, normalizeApiKeyPermissions, type ApiKeyRecord } from "./apiKeyHelpers";
import { buildProviderModelRequest, parseProviderModels } from "./aiProviderCatalog";
import { fetchAiProvider } from "./aiProviderTransport";

const modelChecks = new Map<string, { apiKey: string; baseUrl: string; expiresAt: number; models: Promise<string[]> }>();

/** Additional models need an affirmative provider response; saved settings remain usable. */
export async function loadApiKeyModelTargets(records: readonly ApiKeyRecord[], geminiModels: readonly string[]) {
  const targets = buildApiKeyModelTargets(records.filter(record => normalizeApiKeyPermissions(record.permissions).read), geminiModels);
  for (const [id, cached] of modelChecks) if (cached.expiresAt <= Date.now()) modelChecks.delete(id);
  const checked = await Promise.all(targets.map(async target => {
    if (!isOpenAiOnDemandTarget(target)) return target;
    const { metadata } = normalizeApiKeyPermissions(target.record.permissions);
    const record = target.record, baseUrl = metadata.baseUrl.trim().replace(/\/+$/, "");
    if (!record.api_key.trim()) return null;
    let cached = modelChecks.get(record.id);
    if (!cached || cached.apiKey !== record.api_key || cached.baseUrl !== baseUrl) {
      const models = withReadDeadline(async signal => {
        const request = buildProviderModelRequest({ provider: metadata.provider, baseUrl, apiKey: "" });
        const response = await fetchAiProvider(metadata.provider, request.url, { method: request.method, headers: request.headers, signal }, record.id);
        return response.ok ? parseProviderModels(metadata.provider, await response.json()) : [];
      }, 5_000).catch(() => []);
      cached = { apiKey: record.api_key, baseUrl, expiresAt: Date.now() + 60_000, models };
      modelChecks.set(record.id, cached);
    }
    return (await cached.models).includes(target.model) ? target : null;
  }));
  return checked.filter((target): target is NonNullable<typeof target> => target !== null);
}
