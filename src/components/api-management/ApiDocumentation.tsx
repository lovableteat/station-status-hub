import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Copy,
  ExternalLink,
  FileJson,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { API_BASE_URL, API_ENDPOINTS, buildApiUrl } from "./apiManagementConfig";

const successExample = `{
  "success": true,
  "data": {
    "totalIssues": 25,
    "totalSystems": 150,
    "completedSystems": 120
  }
}`;

const errorExample = `{
  "error": "Invalid or expired API key"
}`;

function copyText(value: string, label: string) {
  void navigator.clipboard.writeText(value);
  toast.success(`${label} 已複製`);
}

function CodePanel({
  title,
  code,
  tone = "default",
}: {
  title: string;
  code: string;
  tone?: "default" | "success" | "error";
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-400/25 bg-emerald-500/10"
      : tone === "error"
        ? "border-rose-400/25 bg-rose-500/10"
        : "border-blue-400/15 bg-[#09121f]";

  return (
    <div className={`rounded-2xl border ${toneClassName} p-4`}>
      <div className="mb-3 flex items-center gap-2">
        {tone === "success" ? (
          <Sparkles className="h-4 w-4 text-emerald-300" />
        ) : tone === "error" ? (
          <AlertTriangle className="h-4 w-4 text-rose-300" />
        ) : (
          <FileJson className="h-4 w-4 text-cyan-300" />
        )}
        <p className="text-sm font-black text-slate-100">{title}</p>
      </div>
      <pre className="overflow-auto rounded-xl border border-white/8 bg-[#06101c] px-4 py-3 font-mono text-sm leading-7 text-slate-100">
        {code}
      </pre>
    </div>
  );
}

export function ApiDocumentation() {
  const [apiKey, setApiKey] = useState("");
  const [selectedKey, setSelectedKey] = useState(API_ENDPOINTS[0]?.key ?? "stats");
  const [pathValue, setPathValue] = useState("");
  const [queryValue, setQueryValue] = useState("");
  const [responseText, setResponseText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const selectedEndpoint = useMemo(
    () => API_ENDPOINTS.find((endpoint) => endpoint.key === selectedKey) ?? API_ENDPOINTS[0],
    [selectedKey],
  );

  const requestUrl = useMemo(() => {
    if (!selectedEndpoint) return "";

    return buildApiUrl(selectedEndpoint.path, {
      pathParams: selectedEndpoint.pathParamKey
        ? { [selectedEndpoint.pathParamKey]: pathValue }
        : undefined,
      queryParams: selectedEndpoint.queryParamKey
        ? { [selectedEndpoint.queryParamKey]: queryValue }
        : undefined,
    });
  }, [pathValue, queryValue, selectedEndpoint]);

  const curlExample = useMemo(() => {
    return [
      `curl -X ${selectedEndpoint?.method ?? "GET"} \\`,
      `  "${requestUrl}" \\`,
      `  -H "x-api-key: YOUR_API_KEY" \\`,
      `  -H "Content-Type: application/json"`,
    ].join("\n");
  }, [requestUrl, selectedEndpoint]);

  const fetchExample = useMemo(() => {
    return [
      `const response = await fetch("${requestUrl}", {`,
      `  method: "${selectedEndpoint?.method ?? "GET"}",`,
      `  headers: {`,
      `    "x-api-key": "YOUR_API_KEY",`,
      `    "Content-Type": "application/json",`,
      `  },`,
      `});`,
      ``,
      `const result = await response.json();`,
      `console.log(result);`,
    ].join("\n");
  }, [requestUrl, selectedEndpoint]);

  const testEndpoint = async () => {
    if (!apiKey.trim()) {
      toast.error("請先輸入 API 金鑰");
      return;
    }

    if (selectedEndpoint?.pathParamKey && !pathValue.trim()) {
      toast.error(`請先輸入 ${selectedEndpoint.pathParamLabel}`);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(requestUrl, {
        method: selectedEndpoint?.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey.trim(),
        },
      });

      const result = await response.json();
      setResponseText(JSON.stringify(result, null, 2));

      if (!response.ok) {
        toast.error(`端點測試失敗：HTTP ${response.status}`);
      } else {
        toast.success("端點測試完成");
      }
    } catch (error) {
      setResponseText(
        JSON.stringify(
          { error: error instanceof Error ? error.message : "Unknown error" },
          null,
          2,
        ),
      );
      toast.error("端點測試失敗");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.96fr_1.04fr]">
        <Card className="border-blue-400/15 bg-[#10192e]">
          <CardHeader className="border-b border-blue-400/10 pb-5">
            <CardTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
              <BookOpen className="h-6 w-6 text-violet-300" />
              API 文件
            </CardTitle>
            <p className="text-sm leading-6 text-slate-400">
              這裡整理正式串接要看的 Base URL、驗證方式、端點說明與標準回應格式。
            </p>
          </CardHeader>

          <CardContent className="space-y-5 pt-5">
            <div className="rounded-3xl border border-blue-400/12 bg-[#0b1423] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                    Base URL
                  </p>
                  <p className="mt-2 break-all text-sm leading-6 text-cyan-100">
                    {API_BASE_URL}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => copyText(API_BASE_URL, "Base URL")}
                  className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-blue-400/12 bg-[#0b1423] p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-300" />
                  <p className="text-sm font-black text-slate-100">驗證方式</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  所有端點都使用 <code className="text-cyan-100">x-api-key</code> 當作驗證 Header。
                </p>
              </div>

              <div className="rounded-3xl border border-blue-400/12 bg-[#0b1423] p-5">
                <div className="flex items-center gap-2">
                  <FileJson className="h-5 w-5 text-cyan-300" />
                  <p className="text-sm font-black text-slate-100">回應格式</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  API 主要回傳 JSON，清單類端點通常會包含{" "}
                  <code className="text-cyan-100">data</code> 和{" "}
                  <code className="text-cyan-100">total</code>。
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <CodePanel title="成功回應範例" code={successExample} tone="success" />
              <CodePanel title="錯誤回應範例" code={errorExample} tone="error" />
            </div>

            <div className="rounded-3xl border border-blue-400/12 bg-[#0b1423] p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-300" />
                <p className="text-sm font-black text-slate-100">端點清單</p>
              </div>

              <div className="mt-4 space-y-3">
                {API_ENDPOINTS.map((endpoint) => (
                  <div
                    key={endpoint.key}
                    className="rounded-2xl border border-blue-400/10 bg-[#10192e] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/15">
                        {endpoint.method}
                      </Badge>
                      <p className="font-bold text-slate-100">{endpoint.path}</p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {endpoint.description}
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      {endpoint.responseSummary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-400/15 bg-[#10192e]">
          <CardHeader className="border-b border-blue-400/10 pb-5">
            <CardTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
              <ExternalLink className="h-6 w-6 text-cyan-300" />
              即時測試與範例
            </CardTitle>
            <p className="text-sm leading-6 text-slate-400">
              選好端點後可直接測試，底下會同步更新 curl 與 fetch 範例。
            </p>
          </CardHeader>

          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-300">API 金鑰</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="輸入 API 金鑰後可直接測試"
                  className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-300">選擇端點</Label>
                <Select value={selectedKey} onValueChange={setSelectedKey}>
                  <SelectTrigger className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-blue-400/20 bg-[#10192e] text-slate-100">
                    {API_ENDPOINTS.map((endpoint) => (
                      <SelectItem key={endpoint.key} value={endpoint.key}>
                        {endpoint.method} {endpoint.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedEndpoint?.pathParamKey && (
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-300">
                    {selectedEndpoint.pathParamLabel}
                  </Label>
                  <Input
                    value={pathValue}
                    onChange={(event) => setPathValue(event.target.value)}
                    placeholder={selectedEndpoint.pathParamPlaceholder}
                    className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              )}

              {selectedEndpoint?.queryParamKey && (
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-300">
                    {selectedEndpoint.queryParamLabel}
                  </Label>
                  <Input
                    value={queryValue}
                    onChange={(event) => setQueryValue(event.target.value)}
                    placeholder={selectedEndpoint.queryParamPlaceholder}
                    className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-blue-400/12 bg-[#0b1423] px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                Request URL
              </p>
              <p className="mt-2 break-all text-sm text-cyan-100">{requestUrl}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={testEndpoint}
                disabled={isLoading}
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                {isLoading ? "測試中..." : "測試端點"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => copyText(curlExample, "curl 範例")}
                className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
              >
                複製 curl
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => copyText(fetchExample, "fetch 範例")}
                className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
              >
                複製 fetch
              </Button>
            </div>

            <Separator className="bg-blue-400/10" />

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-black text-slate-200">curl 範例</p>
                <ScrollArea className="h-[180px] rounded-2xl border border-blue-400/12 bg-[#06101c] px-4 py-3">
                  <pre className="font-mono text-sm leading-7 text-slate-100">
                    {curlExample}
                  </pre>
                </ScrollArea>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-black text-slate-200">fetch 範例</p>
                <ScrollArea className="h-[180px] rounded-2xl border border-blue-400/12 bg-[#06101c] px-4 py-3">
                  <pre className="font-mono text-sm leading-7 text-slate-100">
                    {fetchExample}
                  </pre>
                </ScrollArea>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-black text-slate-200">測試回應</p>
              <Textarea
                value={responseText}
                readOnly
                placeholder="測試端點後，這裡會顯示 JSON 回應。"
                className="min-h-[260px] border-blue-400/20 bg-[#06101c] font-mono text-sm leading-7 text-slate-100 placeholder:text-slate-500"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
