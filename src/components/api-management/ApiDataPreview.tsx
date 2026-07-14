import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  KeyRound,
  Play,
  Sparkles,
  Waypoints,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { ApiDataTable } from "./ApiDataTable";
import { API_ENDPOINTS, buildApiUrl } from "./apiManagementConfig";
import {
  buildProviderChatRequest,
  getProviderErrorMessage,
  parseProviderChatResponse,
  redactSensitiveText,
} from "./aiProviderCatalog";
import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

const previewEndpoints = API_ENDPOINTS.filter((endpoint) => endpoint.previewable);

interface ApiDataPreviewProps {
  selectedApiKey?: ApiKeyRecord | null;
}

interface ProviderTestResult {
  status: "success" | "error";
  title: string;
  message: string;
  endpoint: string;
  provider: string;
  model: string;
  durationMs: number;
  statusText: string;
}

function ProviderResultBanner({
  result,
  onDismiss,
}: {
  result: ProviderTestResult;
  onDismiss: () => void;
}) {
  const isSuccess = result.status === "success";

  return (
    <div
      className={[
        "rounded-2xl border px-5 py-4 shadow-[0_14px_38px_rgba(0,0,0,0.22)]",
        isSuccess
          ? "border-emerald-300/70 bg-emerald-700/80 text-emerald-50"
          : "border-rose-300/70 bg-rose-700/80 text-rose-50",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div
            className={[
              "mt-0.5 rounded-full p-1.5",
              isSuccess ? "bg-emerald-950/35" : "bg-rose-950/35",
            ].join(" ")}
          >
            {isSuccess ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-base font-black">{result.title}</p>
            <p className="mt-1 text-sm font-semibold opacity-95">{result.message}</p>

            <div className="mt-3 space-y-1.5 text-sm leading-6 opacity-95">
              <p>端點：{result.endpoint}</p>
              <p>Provider：{result.provider}</p>
              <p>Model：{result.model}</p>
              <p>耗時：{result.durationMs} ms</p>
              <p>回應：{result.statusText}</p>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="h-8 w-8 shrink-0 rounded-xl border border-white/10 bg-black/15 text-current hover:bg-black/25"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function ApiDataPreview({ selectedApiKey }: ApiDataPreviewProps) {
  const [apiKey, setApiKey] = useState("");
  const [selectedEndpointKey, setSelectedEndpointKey] = useState(
    previewEndpoints[0]?.key ?? "stats",
  );
  const [queryValue, setQueryValue] = useState("");
  const [activeRequest, setActiveRequest] = useState<{
    title: string;
    requestUrl: string;
  } | null>(null);
  const [providerPrompt, setProviderPrompt] = useState("請簡短回覆：API 測試成功");
  const [providerResponse, setProviderResponse] = useState("");
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerTestResult, setProviderTestResult] =
    useState<ProviderTestResult | null>(null);

  const selectedMetadata = useMemo(() => {
    return selectedApiKey
      ? normalizeApiKeyPermissions(selectedApiKey.permissions).metadata
      : null;
  }, [selectedApiKey]);

  const hasProviderConfiguration = useMemo(() => {
    return (
      Boolean(selectedMetadata?.provider) &&
      Boolean(selectedMetadata?.baseUrl) &&
      Boolean(selectedMetadata?.model)
    );
  }, [selectedMetadata]);

  useEffect(() => {
    if (!selectedApiKey) return;

    setApiKey(selectedApiKey.api_key);
    setActiveRequest(null);
    setProviderResponse("");
    setProviderTestResult(null);
  }, [selectedApiKey]);

  const selectedEndpoint = useMemo(
    () =>
      previewEndpoints.find((endpoint) => endpoint.key === selectedEndpointKey) ??
      previewEndpoints[0],
    [selectedEndpointKey],
  );

  const requestUrl = useMemo(() => {
    if (!selectedEndpoint) return "";

    return buildApiUrl(selectedEndpoint.path, {
      queryParams: selectedEndpoint.queryParamKey
        ? { [selectedEndpoint.queryParamKey]: queryValue }
        : undefined,
    });
  }, [queryValue, selectedEndpoint]);

  const providerRequest = useMemo(() => {
    if (
      !hasProviderConfiguration ||
      !selectedMetadata?.provider ||
      !selectedMetadata?.baseUrl ||
      !selectedMetadata.model ||
      !apiKey.trim()
    ) {
      return null;
    }

    return buildProviderChatRequest({
      provider: selectedMetadata.provider,
      apiKey: apiKey.trim(),
      baseUrl: selectedMetadata.baseUrl,
      model: selectedMetadata.model,
      messages: [
        {
          role: "user",
          text: providerPrompt.trim() || "請簡短回覆：API 測試成功",
        },
      ],
    });
  }, [apiKey, hasProviderConfiguration, providerPrompt, selectedMetadata]);

  const handleInternalPreview = () => {
    if (!selectedEndpoint) return;

    setActiveRequest({
      title: `${selectedEndpoint.label} (${selectedEndpoint.method} ${selectedEndpoint.path})`,
      requestUrl,
    });
  };

  const handleProviderTest = async () => {
    if (!providerRequest || !selectedMetadata) {
      toast.error("請先補齊 API Key、Base URL 與模型設定。");
      return;
    }

    const startedAt = Date.now();
    setProviderLoading(true);
    setProviderResponse("");
    setProviderTestResult(null);

    try {
      const response = await fetch(providerRequest.url, {
        method: providerRequest.method,
        headers: providerRequest.headers,
        body: providerRequest.body ? JSON.stringify(providerRequest.body) : undefined,
      });

      const result = await response.json().catch(() => null);
      const durationMs = Date.now() - startedAt;
      setProviderResponse(
        redactSensitiveText(JSON.stringify(result, null, 2), [apiKey]),
      );

      if (!response.ok) {
        setProviderTestResult({
          status: "error",
          title: "AI API 連線失敗",
          message: getProviderErrorMessage(result, response.status, [apiKey]),
          endpoint: providerRequest.url,
          provider: selectedMetadata.provider,
          model: selectedMetadata.model,
          durationMs,
          statusText: `HTTP ${response.status}`,
        });
        toast.error(`AI API 測試失敗：HTTP ${response.status}`);
        return;
      }

      const parsed = parseProviderChatResponse(selectedMetadata.provider, result);
      setProviderTestResult({
        status: "success",
        title: "AI API 連線正常",
        message:
          redactSensitiveText(parsed.text, [apiKey]) ||
          `${selectedMetadata.provider} API 已正常回應。`,
        endpoint: providerRequest.url,
        provider: selectedMetadata.provider,
        model: selectedMetadata.model,
        durationMs,
        statusText: "OK",
      });
      toast.success("AI API 測試完成");
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      setProviderResponse(
        redactSensitiveText(
          JSON.stringify(
            { error: error instanceof Error ? error.message : "Unknown error" },
            null,
            2,
          ),
          [apiKey],
        ),
      );
      setProviderTestResult({
        status: "error",
        title: "AI API 連線失敗",
        message: error instanceof Error ? error.message : "AI API 測試失敗",
        endpoint: providerRequest.url,
        provider: selectedMetadata.provider,
        model: selectedMetadata.model,
        durationMs,
        statusText: "ERROR",
      });
      toast.error("AI API 測試失敗");
    } finally {
      setProviderLoading(false);
    }
  };

  if (hasProviderConfiguration && selectedApiKey && selectedMetadata) {
    return (
      <div className="space-y-5">
        <Card className="border-emerald-300/18 bg-[#17253d] shadow-[0_24px_60px_rgba(2,8,23,0.22)]">
          <CardHeader className="border-b border-emerald-300/10 pb-5">
            <CardTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
              <Sparkles className="h-6 w-6 text-emerald-300" />
              外部 API 測試
            </CardTitle>
            <p className="text-sm leading-6 text-slate-300">
              你現在選的是外部服務金鑰。這裡會直接對{" "}
              {selectedMetadata.provider} 發真實測試請求。
            </p>
          </CardHeader>

          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-cyan-300/14 bg-[#111d33] p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">
                  金鑰名稱
                </p>
                <p className="mt-2 text-sm font-bold text-slate-100">
                  {selectedApiKey.key_name}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-300/14 bg-[#111d33] p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">
                  Provider
                </p>
                <p className="mt-2 text-sm font-bold text-slate-100">
                  {selectedMetadata.provider}
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-300/14 bg-[#111d33] p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">
                  Model
                </p>
                <p className="mt-2 text-sm font-bold text-slate-100">
                  {selectedMetadata.model || "-"}
                </p>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-300">API 金鑰</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={`可直接貼上要測試的 ${selectedMetadata.provider} API Key`}
                      className="h-11 border-cyan-300/18 bg-[#111d33] pl-10 text-slate-50 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-300">
                    測試提示詞
                  </Label>
                  <Textarea
                    value={providerPrompt}
                    onChange={(event) => setProviderPrompt(event.target.value)}
                    placeholder="輸入你要測試模型回應的內容"
                    className="min-h-[120px] border-cyan-300/18 bg-[#111d33] text-slate-50 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-cyan-300/14 bg-[#111d33] p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-200">
                    <Waypoints className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-50">
                      POST {providerRequest?.url.replace(/^https?:\/\/[^/]+/, "") || "AI 端點"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      系統會依服務商自動使用正確的驗證標頭、請求格式與回應解析。
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-cyan-300/12 bg-[#182640] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">
                    Request URL
                  </p>
                  <p className="mt-2 break-all text-sm leading-6 text-cyan-100">
                    {providerRequest?.url || "請先補齊測試資料"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge className="bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/15">
                    {selectedMetadata.provider}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-cyan-300/15 bg-transparent text-slate-200"
                  >
                    POST
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-cyan-300/15 bg-transparent text-slate-200"
                  >
                    JSON
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void handleProviderTest()}
                disabled={providerLoading || !apiKey.trim()}
                className="bg-emerald-400 text-slate-950 shadow-[0_12px_24px_rgba(74,222,128,0.22)] hover:bg-emerald-300"
              >
                <Play className="mr-2 h-4 w-4" />
                {providerLoading ? "測試中..." : `測試 ${selectedMetadata.provider} API`}
              </Button>
            </div>

            {providerTestResult ? (
              <ProviderResultBanner
                result={providerTestResult}
                onDismiss={() => setProviderTestResult(null)}
              />
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-black text-slate-200">測試回應</p>
              <Textarea
                value={providerResponse}
                readOnly
                placeholder="送出測試後，這裡會顯示實際 API 回應。"
                className="min-h-[320px] border-cyan-300/18 bg-[#0d1729] font-mono text-sm leading-7 text-slate-100 placeholder:text-slate-400"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-emerald-300/18 bg-[#17253d] shadow-[0_24px_60px_rgba(2,8,23,0.22)]">
        <CardHeader className="border-b border-emerald-300/10 pb-5">
          <CardTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
            <Database className="h-6 w-6 text-emerald-300" />
            內部 API 測試
          </CardTitle>
          <p className="text-sm leading-6 text-slate-300">
            輸入內部 API key 後測試正式端點，確認回傳資料正確再交給外部系統串接。
          </p>
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-300">API 金鑰</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="輸入內部 API key"
                    className="h-11 border-cyan-300/18 bg-[#111d33] pl-10 text-slate-50 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-300">選擇端點</Label>
                <Select value={selectedEndpointKey} onValueChange={setSelectedEndpointKey}>
                  <SelectTrigger className="h-11 border-cyan-300/18 bg-[#111d33] text-slate-50">
                    <SelectValue placeholder="選擇 API 端點" />
                  </SelectTrigger>
                  <SelectContent className="border-cyan-300/20 bg-[#17253d] text-slate-50">
                    {previewEndpoints.map((endpoint) => (
                      <SelectItem key={endpoint.key} value={endpoint.key}>
                        {endpoint.method} {endpoint.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedEndpoint?.queryParamKey && (
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-300">
                    {selectedEndpoint.queryParamLabel}
                  </Label>
                  <Input
                    value={queryValue}
                    onChange={(event) => setQueryValue(event.target.value)}
                    placeholder={selectedEndpoint.queryParamPlaceholder}
                    className="h-11 border-cyan-300/18 bg-[#111d33] text-slate-50 placeholder:text-slate-400"
                  />
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-cyan-300/14 bg-[#111d33] p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-200">
                  <Waypoints className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-50">
                    {selectedEndpoint?.method} {selectedEndpoint?.path}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {selectedEndpoint?.description}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-300/12 bg-[#182640] p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">
                  Response
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {selectedEndpoint?.responseSummary}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/15">
                  x-api-key
                </Badge>
                <Badge
                  variant="outline"
                  className="border-cyan-300/15 bg-transparent text-slate-200"
                >
                  JSON
                </Badge>
                <Badge
                  variant="outline"
                  className="border-cyan-300/15 bg-transparent text-slate-200"
                >
                  GET
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <code className="overflow-hidden rounded-xl border border-cyan-300/15 bg-[#111d33] px-3 py-2 text-sm text-cyan-50">
              {requestUrl}
            </code>
            <Button
              type="button"
              onClick={handleInternalPreview}
              disabled={!apiKey.trim() || !selectedEndpoint}
              className="bg-emerald-400 text-slate-950 shadow-[0_12px_24px_rgba(74,222,128,0.22)] hover:bg-emerald-300"
            >
              <Play className="mr-2 h-4 w-4" />
              測試內部 API
            </Button>
          </div>
        </CardContent>
      </Card>

      {activeRequest && (
        <ApiDataTable
          apiKey={apiKey}
          requestUrl={activeRequest.requestUrl}
          title={activeRequest.title}
        />
      )}
    </div>
  );
}
