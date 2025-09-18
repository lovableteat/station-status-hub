import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeyManagement } from "./ApiKeyManagement";
import { ApiDocumentation } from "./ApiDocumentation";
import { ApiDataPreview } from "./ApiDataPreview";
import { Key, FileText, Database } from "lucide-react";

export function ApiManagementPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">API 金鑰管理</h1>
        <p className="text-muted-foreground">
          管理外部系統存取您的資料的 API 金鑰和查看相關文檔
        </p>
      </div>

      <Tabs defaultValue="keys" className="space-y-6">
        <TabsList>
          <TabsTrigger value="keys" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            金鑰管理
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            數據預覽
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            API 文檔
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-6">
          <ApiKeyManagement />
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          <ApiDataPreview />
        </TabsContent>

        <TabsContent value="docs" className="space-y-6">
          <ApiDocumentation />
        </TabsContent>
      </Tabs>
    </div>
  );
}