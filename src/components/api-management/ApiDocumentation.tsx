import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ApiDocumentation() {
  const baseUrl = "https://rfppeuzuoxtqkpbwehbq.supabase.co/functions/v1/api";

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已複製到剪貼簿');
    } catch (error) {
      toast.error('複製失敗');
    }
  };

  const endpoints = [
    {
      method: "GET",
      path: "/issues",
      description: "獲取問題列表",
      response: "問題陣列，包含標題、描述、狀態等資訊"
    },
    {
      method: "GET", 
      path: "/issues/{id}",
      description: "獲取單個問題詳情",
      response: "問題物件，包含完整資訊和附件"
    },
    {
      method: "GET",
      path: "/test-systems", 
      description: "獲取測試系統列表",
      response: "測試系統陣列，包含進度、狀態等資訊"
    },
    {
      method: "GET",
      path: "/test-progress",
      description: "獲取測試進度",
      parameters: "system_id（可選）- 篩選特定系統",
      response: "測試進度陣列"
    },
    {
      method: "GET",
      path: "/stats",
      description: "獲取統計數據", 
      response: "包含問題、系統、進度的統計摘要"
    },
    {
      method: "GET",
      path: "/docs",
      description: "獲取 API 文檔",
      response: "API 文檔和端點說明"
    }
  ];

  const exampleCode = `// JavaScript 範例
const apiKey = 'ak_your_api_key_here';

fetch('${baseUrl}/issues', {
  headers: {
    'x-api-key': apiKey,
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log(data));

// curl 範例  
curl -H "x-api-key: ak_your_api_key_here" \\
     -H "Content-Type: application/json" \\
     "${baseUrl}/issues"`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>連接步驟指南</CardTitle>
          <p className="text-sm text-muted-foreground">
            按照以下步驟連接到您的生產管理系統 API
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-medium">第一步：獲取 API 金鑰</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-4">
                <li>點擊左側導航欄中的「API 金鑰管理」</li>
                <li>切換到「金鑰管理」標籤</li>
                <li>點擊「建立新金鑰」按鈕</li>
                <li>填寫金鑰名稱和描述</li>
                <li>選擇所需的權限（讀取/寫入）</li>
                <li>點擊「建立」按鈕</li>
                <li>複製生成的 API 金鑰（格式：ak_...）</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium">第二步：測試連接</h4>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    1. 使用 curl 命令測試（替換 YOUR_API_KEY 為實際金鑰）：
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <code className="flex-1 p-2 bg-muted rounded text-sm">
                      curl -H "x-api-key: YOUR_API_KEY" {baseUrl}/stats
                    </code>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => copyToClipboard(`curl -H "x-api-key: YOUR_API_KEY" ${baseUrl}/stats`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    2. 使用瀏覽器開發者工具測試：
                  </p>
                  <pre className="p-3 bg-muted rounded text-sm overflow-x-auto">
                    <code>{`fetch('${baseUrl}/stats', {
  headers: {
    'x-api-key': 'YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));`}</code>
                  </pre>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    3. 使用 Postman 或其他 API 工具：
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                    <li>URL: <code className="bg-muted px-1 rounded">{baseUrl}/stats</code></li>
                    <li>方法: GET</li>
                    <li>標頭: x-api-key = YOUR_API_KEY</li>
                    <li>標頭: Content-Type = application/json</li>
                  </ul>
                </div>

                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>成功回應範例：</strong>
                  </p>
                  <pre className="mt-2 p-2 bg-white rounded text-xs">
                    <code>{`{
  "success": true,
  "data": {
    "totalIssues": 25,
    "totalSystems": 150,
    "completedSystems": 120
  }
}`}</code>
                  </pre>
                </div>

                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">
                    <strong>錯誤回應範例：</strong>
                  </p>
                  <pre className="mt-2 p-2 bg-white rounded text-xs">
                    <code>{`{
  "error": "Invalid or expired API key"
}`}</code>
                  </pre>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium">第三步：整合到您的應用程式</h4>
              <p className="text-sm text-muted-foreground">
                在每個 API 請求的標頭中加入您的金鑰：
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>標頭名稱：<code className="bg-muted px-1 rounded">x-api-key</code></li>
                <li>標頭值：您的 API 金鑰</li>
                <li>內容類型：<code className="bg-muted px-1 rounded">application/json</code></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium">注意事項</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>請妥善保管您的 API 金鑰，不要在公開場所分享</li>
                <li>如果金鑰洩露，請立即停用並建立新的金鑰</li>
                <li>可以在金鑰管理頁面查看使用統計和管理金鑰狀態</li>
                <li>每個 API 請求都會記錄使用次數和最後使用時間</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API 文檔</CardTitle>
          <p className="text-sm text-muted-foreground">
            使用以下端點來存取您的生產管理系統資料
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">基礎 URL</h4>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-sm">
                  {baseUrl}
                </code>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyToClipboard(baseUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.open(`${baseUrl}/docs`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">認證方式</h4>
              <p className="text-sm text-muted-foreground mb-2">
                在請求標頭中包含您的 API 金鑰：
              </p>
              <code className="block p-2 bg-muted rounded text-sm">
                x-api-key: ak_your_api_key_here
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>可用端點</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {endpoints.map((endpoint, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={endpoint.method === 'GET' ? 'default' : 'secondary'}>
                    {endpoint.method}
                  </Badge>
                  <code className="text-sm">{endpoint.path}</code>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {endpoint.description}
                </p>
                {endpoint.parameters && (
                  <div className="text-sm">
                    <span className="font-medium">參數：</span> {endpoint.parameters}
                  </div>
                )}
                <div className="text-sm">
                  <span className="font-medium">回傳：</span> {endpoint.response}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>使用範例</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-medium">程式碼範例</h4>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyToClipboard(exampleCode)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <pre className="p-4 bg-muted rounded text-sm overflow-x-auto">
                <code>{exampleCode}</code>
              </pre>
            </div>

            <div>
              <h4 className="font-medium mb-2">回應格式</h4>
              <pre className="p-4 bg-muted rounded text-sm overflow-x-auto">
                <code>{`{
  "success": true,
  "data": [...],
  "total": 10
}`}</code>
              </pre>
            </div>

            <div>
              <h4 className="font-medium mb-2">錯誤回應</h4>
              <pre className="p-4 bg-muted rounded text-sm overflow-x-auto">
                <code>{`{
  "error": "Invalid or expired API key"
}`}</code>
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}