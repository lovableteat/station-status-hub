import { useState } from "react";
import {
  ServerCog,
  ShieldCheck,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ApiDataPreview } from "./ApiDataPreview";
import { ApiDocumentation } from "./ApiDocumentation";
import { ApiKeyManagement } from "./ApiKeyManagement";
import type { ApiKeyRecord } from "./apiKeyHelpers";

export function ApiManagementPage() {
  const [activeTab, setActiveTab] = useState("keys");
  const [selectedApiKey, setSelectedApiKey] = useState<ApiKeyRecord | null>(null);

  const handleTestKey = (record: ApiKeyRecord) => {
    setSelectedApiKey(record);
    setActiveTab("preview");
  };

  return (
    <div
      data-admin-surface="api-control-room"
      className="admin-api-workspace"
    >
      <section data-admin-zone="api-overview" className="admin-api-hero">
        <div className="admin-api-hero-content">
          <div className="admin-api-hero-main">
            <div className="admin-api-hero-title">
              <div className="admin-api-icon">
                <ServerCog className="h-5 w-5" />
              </div>
              <div className="admin-api-hero-copy">
                <h1>API 控制台</h1>
                <p>管理網站 API 與 Provider 金鑰，依序完成金鑰設定、測試與串接文件。</p>
              </div>
            </div>

            <div className="admin-api-context-grid" aria-label="API 管理流程與安全狀態">
              <span><b>01</b> 金鑰管理</span>
              <span><b>02</b> 直接測試</span>
              <span><b>03</b> 串接文件</span>
              <span className="admin-api-security-status">
                <ShieldCheck className="h-4 w-4" />
                金鑰預設遮罩
              </span>
            </div>
          </div>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="admin-api-tabs grid h-auto w-full grid-cols-1 gap-2 p-2 text-slate-200 sm:grid-cols-3">
          <TabsTrigger
            value="keys"
            className="admin-api-tab py-2.5 text-sm font-bold"
          >
            金鑰管理
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="admin-api-tab py-2.5 text-sm font-bold"
          >
            API 測試
          </TabsTrigger>
          <TabsTrigger
            value="docs"
            className="admin-api-tab py-2.5 text-sm font-bold"
          >
            API 文件
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="mt-0">
          <ApiKeyManagement onTestKey={handleTestKey} />
        </TabsContent>

        <TabsContent value="preview" className="mt-0">
          <ApiDataPreview selectedApiKey={selectedApiKey} />
        </TabsContent>

        <TabsContent value="docs" className="mt-0">
          <ApiDocumentation />
        </TabsContent>
      </Tabs>
    </div>
  );
}
