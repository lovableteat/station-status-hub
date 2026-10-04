import { supabase } from "@/integrations/supabase/client";
import { classifyAiUsageOutcome } from "./aiUsageSummary";

export const AI_USAGE_RECORDED_EVENT = "ai-usage-recorded";
export const AI_PROVIDER_REQUEST_TIMEOUT_MS = 120_000;

export type AiUsageSource = "ai-chat" | "api-test";
export type AiUsageOutcome =
  | "succeeded"
  | "http_error"
  | "rate_limited"
  | "timeout"
  | "network_error";

interface TrackedProviderFetchInput {
  apiKeyId: string | null;
  provider: string;
  model: string;
  source: AiUsageSource;
  attemptNumber: number;
  url: string;
  init: RequestInit;
  timeoutMs?: number;
}

function notifyUsageRecorded() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AI_USAGE_RECORDED_EVENT));
  }
}

async function finishAttempt(
  eventId: string | null,
  outcome: AiUsageOutcome,
  httpStatus: number | null,
  durationMs: number,
) {
  if (!eventId) return;

  const { error } = await supabase.rpc("finish_ai_model_usage_attempt", {
    p_event_id: eventId,
    p_outcome: outcome,
    p_http_status: httpStatus,
    p_duration_ms: Math.min(Math.max(0, Math.round(durationMs)), 900_000),
  });
  if (error) console.error("Failed to finish AI usage telemetry:", error);
  notifyUsageRecorded();
}

export async function trackedProviderFetch({
  apiKeyId,
  provider,
  model,
  source,
  attemptNumber,
  url,
  init,
  timeoutMs = AI_PROVIDER_REQUEST_TIMEOUT_MS,
}: TrackedProviderFetchInput) {
  const eventId = apiKeyId ? globalThis.crypto.randomUUID() : null;
  let trackedEventId: string | null = null;
  if (eventId && apiKeyId) {
    const { error } = await supabase.rpc("start_ai_model_usage_attempt", {
      p_event_id: eventId,
      p_api_key_id: apiKeyId,
      p_provider: provider.trim().toLowerCase(),
      p_model: model.trim(),
      p_source: source,
      p_attempt_number: attemptNumber,
    });
    if (error) {
      console.error("Failed to start AI usage telemetry:", error);
      throw new Error("無法建立本系統用量紀錄，AI 請求尚未送出。請稍後再試。");
    } else {
      trackedEventId = eventId;
    }
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const outcome: AiUsageOutcome = classifyAiUsageOutcome({
      responseOk: response.ok,
      status: response.status,
    });
    await finishAttempt(trackedEventId, outcome, response.status, Date.now() - startedAt);
    return response;
  } catch (error) {
    await finishAttempt(
      trackedEventId,
      classifyAiUsageOutcome({ aborted: controller.signal.aborted }),
      null,
      Date.now() - startedAt,
    );
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}
