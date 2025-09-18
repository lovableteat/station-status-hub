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