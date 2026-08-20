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
    step: "01",
    title: "金鑰控管",
    description: "建立或選擇要使用的 API 金鑰，內容預設遮罩並保留 provider 與模型設定。",
    hint: "先準備憑證",
    icon: KeyRound,
  },
  {
    step: "02",
    title: "直接測試",
    description: "用已選金鑰送出測試請求，確認端點、權限與回應格式都正常。",
    hint: "確認能正常回應",
    icon: Database,
  },
  {
    step: "03",
    title: "串接文件",
    description: "查看 Base URL、Header、curl 與 fetch 範例，交給 MES 或其他工具串接。",
    hint: "交付給串接者",
    icon: FileCode2,
  },
];

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
        <div className="admin-api-hero-content space-y-5 p-4 sm:p-5 lg:p-6">
          <div className="admin-api-hero-main grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] lg:items-end">
            <div className="max-w-3xl space-y-3">
              <div className="admin-api-icon h-12 w-12">
                <ServerCog className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-50">
                  API 控制台
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  依照「管理金鑰 → 直接測試 → 提供文件」三步驟完成 API 串接；這裡不會改動 AI 對話內容。
                </p>
              </div>
            </div>

            <div className="admin-api-context-grid grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="admin-api-chip">
                <p className="admin-api-chip-label">
                  你正在管理
                </p>
                <p className="mt-2 text-base font-bold text-slate-50">網站 API 與 Provider 金鑰</p>
              </div>
              <div className="admin-api-chip">
                <p className="admin-api-chip-label">
                  操作順序
                </p>
                <p className="mt-2 text-base font-bold text-slate-50">1 金鑰 · 2 測試 · 3 文件</p>
              </div>
              <div className="admin-api-chip">
                <p className="admin-api-chip-label">
                  安全原則
                </p>
                <p className="mt-2 flex items-center gap-2 text-base font-bold text-slate-50">
                  <ShieldCheck className="h-4 w-4 text-[#d8e7ff]" />
                  預設遮罩金鑰
                </p>
              </div>
            </div>
          </div>

          <div className="admin-api-feature-grid grid gap-3 lg:grid-cols-3">
            {summaryCards.map((card) => {
              const Icon = card.icon;

              return (
                <article
                  key={card.title}
                  className="admin-api-card p-5"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <div className="admin-api-icon mt-0.5 h-11 w-11">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] font-black tracking-[0.18em] text-cyan-200/70">{card.step}</span>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{card.hint}</p>
                      <h2 className="mt-1 text-lg font-bold text-slate-50">{card.title}</h2>
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
