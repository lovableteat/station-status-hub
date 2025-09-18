import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Database, Key, AlertCircle } from "lucide-react";
import { ApiDataTable } from "./ApiDataTable";

const API_ENDPOINTS = [
  {
    value: "/issues",
    label: "問題追蹤",
    description: "查看系統中的所有問題和 Bug 報告",
  },
  {
    value: "/systems",
    label: "測試系統",
    description: "查看所有測試系統的狀態和進度",
  },
  {
    value: "/progress",
    label: "測試進度",
    description: "查看詳細的測試進度數據",
  },
  {
    value: "/statistics",
    label: "統計數據",
    description: "查看系統統計和分析數據",
  },
];

export function ApiDataPreview() {
  const [apiKey, setApiKey] = useState("");
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [showTable, setShowTable] = useState(false);

  const handlePreview = () => {
    if (!apiKey.trim()) {
      return;
    }
    if (!selectedEndpoint) {
      return;
    }
    setShowTable(true);
  };

  const selectedEndpointInfo = API_ENDPOINTS.find(ep => ep.value === selectedEndpoint);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            API 數據預覽
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            使用您的 API 金鑰直接預覽和分析數據，支援搜尋、篩選和匯出功能
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">API 金鑰</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="password"
                  placeholder="輸入您的 API 金鑰"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">選擇端點</label>
              <Select value={selectedEndpoint} onValueChange={setSelectedEndpoint}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇要預覽的數據端點" />
                </SelectTrigger>
                <SelectContent>
                  {API_ENDPOINTS.map((endpoint) => (
                    <SelectItem key={endpoint.value} value={endpoint.value}>
                      {endpoint.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedEndpointInfo && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-info mt-0.5" />
                <div>
                  <div className="font-medium">{selectedEndpointInfo.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedEndpointInfo.description}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <Button 
              onClick={handlePreview}
              disabled={!apiKey.trim() || !selectedEndpoint}
            >
              預覽數據
            </Button>
            {showTable && (
              <Badge variant="outline">
                已載入 {selectedEndpointInfo?.label} 數據
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {showTable && apiKey && selectedEndpoint && (
        <ApiDataTable
          apiKey={apiKey}
          endpoint={selectedEndpoint}
          title={selectedEndpointInfo?.label || "API 數據"}
        />
      )}

      {/* 功能介紹 */}
      <Card>
        <CardHeader>
          <CardTitle>數據表格功能</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">篩選與搜尋</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 全文搜尋所有欄位</li>
                <li>• 按狀態篩選數據</li>
                <li>• 自動識別數據類型</li>
                <li>• 即時篩選與統計</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">匯出與分析</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• CSV 格式匯出</li>
                <li>• Excel 格式匯出</li>
                <li>• 保留篩選結果</li>
                <li>• 支援中文編碼</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}