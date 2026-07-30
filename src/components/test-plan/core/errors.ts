interface TestPlanErrorLike {
  code?: unknown;
  details?: unknown;
  error?: unknown;
  hint?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

const DEFAULT_ERROR_MESSAGE = "操作失敗，請稍後再試。";

function readableText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorParts(error: unknown) {
  if (error instanceof Error) {
    const withCause = error as Error & TestPlanErrorLike;
    return {
      code: readableText(withCause.code),
      details: readableText(withCause.details),
      error: readableText(withCause.error),
      hint: readableText(withCause.hint),
      message: readableText(error.message),
      status: Number(withCause.status ?? withCause.statusCode) || 0,
    };
  }

  if (error && typeof error === "object") {
    const candidate = error as TestPlanErrorLike;
    return {
      code: readableText(candidate.code),
      details: readableText(candidate.details),
      error: readableText(candidate.error),
      hint: readableText(candidate.hint),
      message: readableText(candidate.message),
      status: Number(candidate.status ?? candidate.statusCode) || 0,
    };
  }

  return {
    code: "",
    details: "",
    error: "",
    hint: "",
    message: readableText(error),
    status: 0,
  };
}

export function getTestPlanErrorMessage(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): string {
  const parts = errorParts(error);
  const searchable = [
    parts.code,
    parts.error,
    parts.message,
    parts.details,
    parts.hint,
  ]
    .join(" ")
    .toLowerCase();

  if (
    searchable.includes("invalidkey")
    || searchable.includes("invalid key")
  ) {
    return "儲存服務拒絕了檔名路徑；系統已改用安全識別碼，請重新選取檔案後再上傳。";
  }

  if (
    parts.code === "PGRST205"
    || parts.code === "42P01"
    || searchable.includes("could not find the table")
    || searchable.includes("does not exist")
  ) {
    return "Test_Plan 資料庫尚未完成部署，請聯絡管理員後再試。";
  }

  if (
    parts.code === "42501"
    || searchable.includes("row-level security")
    || searchable.includes("permission denied")
  ) {
    return "目前登入帳號沒有建立或修改 Test_Plan 空間的權限，請確認後台權限後再試。";
  }

  if (
    parts.code === "23505"
    || searchable.includes("duplicate key")
    || searchable.includes("owner_name_uidx")
  ) {
    return "已有同名的資料空間，請改用其他名稱。";
  }

  if (
    parts.status === 401
    || parts.code === "PGRST301"
    || searchable.includes("jwt expired")
    || searchable.includes("invalid jwt")
  ) {
    return "登入工作階段已失效，請重新登入後再試。";
  }

  if (
    searchable.includes("failed to fetch")
    || searchable.includes("networkerror")
    || searchable.includes("network request failed")
  ) {
    return "目前無法連線到資料庫，請確認網路後再試。";
  }

  return parts.message || parts.details || parts.hint || fallback;
}

export function toTestPlanError(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): Error {
  return new Error(getTestPlanErrorMessage(error, fallback));
}
