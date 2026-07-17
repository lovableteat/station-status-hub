export const SUPABASE_EGRESS_RESTRICTION_MESSAGE =
  "資料服務的本期流量已達上限，目前暫時停止回應。請由管理員處理 Supabase 方案或等待下個計費週期重置。";

function readErrorText(error) {
  if (!error || typeof error !== "object") {
    return typeof error === "string" ? error : "";
  }

  return [
    error.code,
    error.status,
    error.statusCode,
    error.message,
    error.details,
    error.hint,
  ]
    .filter((value) => value !== null && value !== undefined)
    .join(" ");
}

export function isSupabaseServiceRestrictedError(error) {
  const errorText = readErrorText(error);

  return (
    /\b402\b/.test(errorText) ||
    /exceed_egress_quota|egress exceeded|service(?:s)? (?:for this project )?is restricted|payment required/i.test(
      errorText,
    )
  );
}
