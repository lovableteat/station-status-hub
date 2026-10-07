import { supabase } from "@/integrations/supabase/client";
import { classifyAiUsageOutcome } from "./aiUsageSummary";
import { withReadDeadline } from '@/lib/readDeadline';
import { AiRequestFailure } from './aiRequestRecovery';
export const AI_USAGE_RECORDED_EVENT = "ai-usage-recorded";
export const AI_PROVIDER_REQUEST_TIMEOUT_MS = 120000;
export type AiUsageSource = "ai-chat" | "api-test";
export type AiUsageOutcome = "succeeded" | "http_error" | "rate_limited" | "timeout" | "network_error";
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
async function finishAttempt(eventId: string | null, outcome: AiUsageOutcome, httpStatus: number | null, durationMs: number) {
    if (!eventId)
        return;
    try {
        const { error } = await withReadDeadline(signal => supabase.rpc("finish_ai_model_usage_attempt", {
            p_event_id: eventId,
            p_outcome: outcome,
            p_http_status: httpStatus,
            p_duration_ms: Math.min(Math.max(0, Math.round(durationMs)), 900000),
        }).abortSignal(signal), 8000);
        if (error)
            console.error("Failed to finish AI usage telemetry:", error);
    }
    catch {
        console.error('AI usage completion is delayed; provider response is preserved.');
    }
    notifyUsageRecorded();
}
export async function trackedProviderFetch({ apiKeyId, provider, model, source, attemptNumber, url, init, timeoutMs = AI_PROVIDER_REQUEST_TIMEOUT_MS, }: TrackedProviderFetchInput) {
    const requestedAt = Date.now();
    const eventId = apiKeyId ? globalThis.crypto.randomUUID() : null;
    let trackedEventId: string | null = null;
    if (eventId && apiKeyId) {
        let result;
        try {
            result = await withReadDeadline(signal => supabase.rpc("start_ai_model_usage_attempt", {
                p_event_id: eventId,
                p_api_key_id: apiKeyId,
                p_provider: provider.trim().toLowerCase(),
                p_model: model.trim(),
                p_source: source,
                p_attempt_number: attemptNumber,
            }).abortSignal(signal), Math.min(8000, timeoutMs));
        }
        catch {
            throw new AiRequestFailure('無法確認本系統用量紀錄，請重新登入或稍後重試。', 'tracking');
        }
        const { error } = result;
        if (error) {
            console.error("Failed to start AI usage telemetry:", error);
            throw new AiRequestFailure("無法建立本系統用量紀錄，AI 請求尚未送出。請重新登入或稍後再試。", 'tracking');
        }
        else {
            trackedEventId = eventId;
        }
    }
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
        timer = globalThis.setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new AiRequestFailure('AI 回應逾時，正在嘗試其他可用模型。', 'timeout'));
        }, Math.max(1, timeoutMs - (Date.now() - requestedAt)));
    });
    try {
        const response = await Promise.race([Promise.resolve().then(async () => {
                const upstream = await fetch(url, { ...init, signal: controller.signal });
                // Keep the deadline active through the body, not just response headers.
                const body = await upstream.arrayBuffer();
                return new Response([204, 205, 304].includes(upstream.status) ? null : body, {
                    status: upstream.status, statusText: upstream.statusText, headers: upstream.headers,
                });
            }), deadline]);
        const outcome: AiUsageOutcome = classifyAiUsageOutcome({
            responseOk: response.ok,
            status: response.status,
        });
        void finishAttempt(trackedEventId, outcome, response.status, Date.now() - startedAt);
        return response;
    }
    catch (error) {
        void finishAttempt(trackedEventId, classifyAiUsageOutcome({ aborted: timedOut }), null, Date.now() - startedAt);
        if (timedOut)
            throw new AiRequestFailure('AI 回應逾時，正在嘗試其他可用模型。', 'timeout');
        throw error;
    }
    finally {
        globalThis.clearTimeout(timer!);
    }
}
