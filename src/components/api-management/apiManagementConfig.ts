export const API_BASE_URL = "https://rfppeuzuoxtqkpbwehbq.supabase.co/functions/v1/api";

export interface ApiEndpointConfig {
  key: string;
  method: "GET";
  path: string;
  label: string;
  description: string;
  responseSummary: string;
  pathParamKey?: string;
  pathParamLabel?: string;
  pathParamPlaceholder?: string;
  queryParamKey?: string;
  queryParamLabel?: string;
  queryParamPlaceholder?: string;
  previewable?: boolean;
}

export interface BuildApiUrlOptions {
  pathParams?: Record<string, string | undefined>;
  queryParams?: Record<string, string | undefined>;
}

export const API_ENDPOINTS: ApiEndpointConfig[] = [
  {
    key: "stats",
    method: "GET",
    path: "/stats",
    label: "系統統計",
    description: "回傳問題追蹤、機台系統與測試進度的總覽統計，適合做儀表板摘要。",
    responseSummary: "回傳三組統計資料，每組都包含總數與依狀態分布。",
    previewable: true,
  },
  {
    key: "issues",
    method: "GET",
    path: "/issues",
    label: "Issue 清單",
    description: "列出所有問題追蹤資料，包含標題、優先級、負責人、狀態與建立時間。",
    responseSummary: "回傳 bugs 陣列與 total 數量。",
    previewable: true,
  },
  {
    key: "issue-detail",
    method: "GET",
    path: "/issues/{id}",
    label: "單筆 Issue",
    description: "依照 issue id 取得單筆問題細節，並帶出附件資料。",
    responseSummary: "回傳單筆 bug 詳細資料與附件清單。",
    pathParamKey: "id",
    pathParamLabel: "Issue ID",
    pathParamPlaceholder: "輸入 issue id",
  },
  {
    key: "test-systems",
    method: "GET",
    path: "/test-systems",
    label: "機台系統清單",
    description: "列出所有機台系統，包含站點、工程師、整體進度與目前狀態。",
    responseSummary: "回傳 test_systems 陣列與 total 數量。",
    previewable: true,
  },
  {
    key: "test-progress",
    method: "GET",
    path: "/test-progress",
    label: "測試進度",
    description: "查詢測試進度資料，可依 system_id 只看單一機台。",
    responseSummary: "回傳 test_progress 陣列與 total 數量。",
    queryParamKey: "system_id",
    queryParamLabel: "system_id",
    queryParamPlaceholder: "可填入 system_id，只看單一機台",
    previewable: true,
  },
  {
    key: "docs",
    method: "GET",
    path: "/docs",
    label: "API 文件",
    description: "取得後端 API 文件說明，包含驗證 header 與可用端點。",
    responseSummary: "回傳 API 基本資訊與 endpoints 文件。",
    previewable: true,
  },
];

export function buildApiUrl(path: string, options?: BuildApiUrlOptions) {
  let resolvedPath = path;

  if (options?.pathParams) {
    Object.entries(options.pathParams).forEach(([key, value]) => {
      const token = `{${key}}`;
      if (resolvedPath.includes(token) && value?.trim()) {
        resolvedPath = resolvedPath.replace(token, encodeURIComponent(value.trim()));
      }
    });
  }

  const url = new URL(`${API_BASE_URL}${resolvedPath}`);

  if (options?.queryParams) {
    Object.entries(options.queryParams).forEach(([key, value]) => {
      if (value?.trim()) {
        url.searchParams.set(key, value.trim());
      }
    });
  }

  return url.toString();
}
