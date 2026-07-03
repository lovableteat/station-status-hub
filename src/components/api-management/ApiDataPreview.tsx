import { useMemo, useState } from "react";
import { Database, KeyRound, Play, Waypoints } from "lucide-react";

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

import { ApiDataTable } from "./ApiDataTable";
import { API_ENDPOINTS, buildApiUrl } from "./apiManagementConfig";

const previewEndpoints = API_ENDPOINTS.filter((endpoint) => endpoint.previewable);

export function ApiDataPreview() {
  const [apiKey, setApiKey] = useState("");
  const [selectedEndpointKey, setSelectedEndpointKey] = useState(
    previewEndpoints[0]?.key ?? "stats",
  );
  const [queryValue, setQueryValue] = useState("");
  const [activeRequest, setActiveRequest] = useState<{
    title: string;
    requestUrl: string;
  } | null>(null);

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

  const handlePreview = () => {
    if (!selectedEndpoint) return;

    setActiveRequest({
      title: `${selectedEndpoint.label} (${selectedEndpoint.method} ${selectedEndpoint.path})`,
      requestUrl,
    });
  };

  return (
    <div className="space-y-5">
      <Card className="border-blue-400/15 bg-[#10192e]">
        <CardHeader className="border-b border-blue-400/10 pb-5">
          <CardTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
            <Database className="h-6 w-6 text-emerald-300" />
            API 資料預覽
          </CardTitle>
          <p className="text-sm leading-6 text-slate-400">
            用有效的 API key 直接打正式端點，先確認回傳內容正不正確，再交給外部系統串接。
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
                    placeholder="輸入有效的 API key"
                    className="h-11 border-blue-400/20 bg-[#0b1423] pl-10 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-300">選擇端點</Label>
                <Select value={selectedEndpointKey} onValueChange={setSelectedEndpointKey}>
                  <SelectTrigger className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100">
                    <SelectValue placeholder="選擇 API 端點" />
                  </SelectTrigger>
                  <SelectContent className="border-blue-400/20 bg-[#10192e] text-slate-100">
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
                    className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-blue-400/15 bg-[#0b1423] p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-200">
                  <Waypoints className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-50">
                    {selectedEndpoint?.method} {selectedEndpoint?.path}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {selectedEndpoint?.description}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-blue-400/10 bg-[#10192e] p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
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
                  className="border-blue-400/15 bg-transparent text-slate-300"
                >
                  JSON
                </Badge>
                <Badge
                  variant="outline"
                  className="border-blue-400/15 bg-transparent text-slate-300"
                >
                  GET
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <code className="overflow-hidden rounded-xl border border-blue-400/15 bg-[#0b1423] px-3 py-2 text-sm text-cyan-100">
              {requestUrl}
            </code>
            <Button
              type="button"
              onClick={handlePreview}
              disabled={!apiKey.trim() || !selectedEndpoint}
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            >
              <Play className="mr-2 h-4 w-4" />
              讀取資料
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
