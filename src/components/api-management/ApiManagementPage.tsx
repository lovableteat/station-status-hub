import { useState } from "react";
import {
  Database,
  FileCode2,
  KeyRound,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ApiDataPreview } from "./ApiDataPreview";
import { ApiDocumentation } from "./ApiDocumentation";
import { ApiKeyManagement } from "./ApiKeyManagement";
import type { ApiKeyRecord } from "./apiKeyHelpers";

const summaryCards = [
  {
    title: "金鑰控管",
    description: "建立、停用、刪除與維護 API 金鑰，provider、model、base URL 一起保存。",
    icon: KeyRound,
  },
  {
    title: "直接測試",
    description: "對內部 API 或外部模型端點發出真實請求，確認格式、權限與回應都正確。",
    icon: Database,
  },
  {
    title: "串接文件",
    description: "整理 request / header / response 範例，讓 MES、報表與外部工具可直接接入。",
    icon: FileCode2,
  },
];

const SHOW_EXTENDED_API_COPY = false;

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
      <section className="admin-api-hero">
        <div className="space-y-6 p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="admin-api-icon h-12 w-12">
                <ServerCog className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-50">
                  API 控制台
                </h1>
                {SHOW_EXTENDED_API_COPY ? <p className="mt-2 text-sm leading-6 text-slate-300">
                  這裡是整個網站對外串接的控制區。你可以管理金鑰、直接測試內外部 API，
                  並整理交給外部系統的串接文件。AI 對話入口獨立放在工作區，不放在這裡。
                </p> : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="admin-api-chip">
                <p className="admin-api-chip-label">
                  Auth
                </p>
                <p className="mt-2 text-base font-bold text-slate-50">API Key / Provider Key</p>
              </div>
              <div className="admin-api-chip">
                <p className="admin-api-chip-label">
                  Scope
                </p>
                <p className="mt-2 text-base font-bold text-slate-50">內部 API + 外部串接 API</p>
              </div>
              <div className="admin-api-chip">
                <p className="admin-api-chip-label">
                  Status
                </p>
                <p className="mt-2 flex items-center gap-2 text-base font-bold text-slate-50">
                  <ShieldCheck className="h-4 w-4 text-[#d8e7ff]" />
                  可直接測試 / 控管
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {summaryCards.map((card) => {
              const Icon = card.icon;

              return (
                <article
                  key={card.title}
                  className="admin-api-card p-5"
                >
                  <div className="flex items-start gap-4">
                    <div className="admin-api-icon mt-0.5 h-11 w-11">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-50">{card.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-200">
                        {card.description}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
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
