export interface AiModelUsageTargetSummary {
  apiKeyId: string;
  provider: string;
  model: string;
  minuteAttempts: number;
  pacificDayAttempts: number;
  totalAttempts: number;
  succeededAttempts: number;
  rateLimitedAttempts: number;
  timeoutAttempts: number;
  failedAttempts: number;
  inFlightAttempts: number;
}

export interface AiModelUsageSummary {
  generatedAt: string | null;
  trackingStartedAt: string | null;
  pacificDayStartedAt: string | null;
  targets: AiModelUsageTargetSummary[];
}

const emptySummary: AiModelUsageSummary = {
  generatedAt: null,
  trackingStartedAt: null,
  pacificDayStartedAt: null,
  targets: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function buildObservedQuotaRange(observedAttempts: number, limit: number) {
  const normalizedObserved = Math.max(0, Math.floor(observedAttempts));
  const normalizedLimit = Math.max(0, Math.floor(limit));
  return {
    min: 0,
    max: Math.max(0, normalizedLimit - normalizedObserved),
  };
}

export function classifyAiUsageOutcome(input: {
  aborted?: boolean;
  responseOk?: boolean;
  status?: number | null;
}) {
  if (input.aborted) return "timeout" as const;
  if (typeof input.responseOk !== "boolean") return "network_error" as const;
  if (input.responseOk) return "succeeded" as const;
  if (input.status === 429) return "rate_limited" as const;
  return "http_error" as const;
}

export function buildAiUsageTargetKey(apiKeyId: string, model: string) {
  return `${apiKeyId}::${model}`;
}

export function getUsageWindowCompleteness(summary: AiModelUsageSummary) {
  const generatedAt = summary.generatedAt ? Date.parse(summary.generatedAt) : Number.NaN;
  const trackingStartedAt = summary.trackingStartedAt
    ? Date.parse(summary.trackingStartedAt)
    : Number.NaN;
  const pacificDayStartedAt = summary.pacificDayStartedAt
    ? Date.parse(summary.pacificDayStartedAt)
    : Number.NaN;

  return {
    minute: Number.isFinite(generatedAt) && Number.isFinite(trackingStartedAt)
      ? trackingStartedAt <= generatedAt - 60_000
      : false,
    pacificDay: Number.isFinite(pacificDayStartedAt) && Number.isFinite(trackingStartedAt)
      ? trackingStartedAt <= pacificDayStartedAt
      : false,
  };
}

export function parseAiModelUsageSummary(value: unknown): AiModelUsageSummary {
  const record = asRecord(value);
  if (!record) return emptySummary;

  const targets = Array.isArray(record.targets)
    ? record.targets.flatMap((item) => {
        const target = asRecord(item);
        if (!target) return [];
        const apiKeyId = asNullableString(target.api_key_id);
        const provider = asNullableString(target.provider);
        const model = asNullableString(target.model);
        if (!apiKeyId || !provider || !model) return [];

        return [{
          apiKeyId,
          provider,
          model,
          minuteAttempts: asNonNegativeInteger(target.minute_attempts),
          pacificDayAttempts: asNonNegativeInteger(target.pacific_day_attempts),
          totalAttempts: asNonNegativeInteger(target.total_attempts),
          succeededAttempts: asNonNegativeInteger(target.succeeded_attempts),
          rateLimitedAttempts: asNonNegativeInteger(target.rate_limited_attempts),
          timeoutAttempts: asNonNegativeInteger(target.timeout_attempts),
          failedAttempts: asNonNegativeInteger(target.failed_attempts),
          inFlightAttempts: asNonNegativeInteger(target.in_flight_attempts),
        }];
      })
    : [];

  return {
    generatedAt: asNullableString(record.generated_at),
    trackingStartedAt: asNullableString(record.tracking_started_at),
    pacificDayStartedAt: asNullableString(record.pacific_day_started_at),
    targets,
  };
}
