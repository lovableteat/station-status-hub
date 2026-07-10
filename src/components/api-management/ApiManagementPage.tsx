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
    tone: "from-cyan-500/18 via-sky-500/12 to-transparent",
  },
  {
    title: "直接測試",
    description: "對內部 API 或外部模型端點發出真實請求，確認格式、權限與回應都正確。",
    icon: Database,
    tone: "from-emerald-500/18 via-teal-500/12 to-transparent",
  },
  {
    title: "串接文件",
    description: "整理 request / header / response 範例，讓 MES、報表與外部工具可直接接入。",
    icon: FileCode2,
    tone: "from-violet-500/18 via-indigo-500/12 to-transparent",
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
    <div className="space-y-6 p-6">
      <section className="overflow-hidden rounded-[28px] border border-cyan-300/22 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.28),transparent_34%),radial-gradient(circle_at_top_left,rgba(34,197,94,0.14),transparent_28%),linear-gradient(180deg,#182640_0%,#101b31_100%)] shadow-[0_28px_80px_rgba(2,8,23,0.34)]">
        <div className="space-y-6 p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/35 bg-cyan-300/14 text-cyan-100 shadow-[0_12px_30px_rgba(34,211,238,0.16)]">
                <ServerCog className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-50">
                  API 控制台
                </h1>
                {false ? <p className="mt-2 text-sm leading-6 text-slate-300">
                  這裡是整個網站對外串接的控制區。你可以管理金鑰、直接測試內外部 API，
                  並整理交給外部系統的串接文件。AI 對話入口獨立放在工作區，不放在這裡。
                </p> : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cyan-300/20 bg-[#172640]/88 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-100/90">
                  Auth
                </p>
                <p className="mt-2 text-base font-bold text-slate-50">API Key / Provider Key</p>
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-[#172640]/88 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-100/90">
                  Scope
                </p>
                <p className="mt-2 text-base font-bold text-slate-50">內部 API + 外部串接 API</p>
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-[#172640]/88 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-100/90">
                  Status
                </p>
                <p className="mt-2 flex items-center gap-2 text-base font-bold text-slate-50">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
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
                  className={`rounded-3xl border border-cyan-300/18 bg-gradient-to-br ${card.tone} from-[rgba(23,38,64,0.98)] via-[rgba(17,28,48,0.96)] to-[rgba(12,20,35,0.98)] p-5 shadow-[0_18px_48px_rgba(2,8,23,0.24)]`}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 rounded-2xl border border-white/12 bg-slate-950/28 p-3 text-slate-50">
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
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl border border-cyan-300/18 bg-[#16233c] p-2 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:grid-cols-3">
          <TabsTrigger
            value="keys"
            className="rounded-xl border border-transparent py-2.5 text-sm font-bold data-[state=active]:border-cyan-300/30 data-[state=active]:bg-cyan-400/16 data-[state=active]:text-cyan-50"
          >
            金鑰管理
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="rounded-xl border border-transparent py-2.5 text-sm font-bold data-[state=active]:border-emerald-300/30 data-[state=active]:bg-emerald-400/16 data-[state=active]:text-emerald-50"
          >
            API 測試
          </TabsTrigger>
          <TabsTrigger
            value="docs"
            className="rounded-xl border border-transparent py-2.5 text-sm font-bold data-[state=active]:border-violet-300/28 data-[state=active]:bg-violet-400/15 data-[state=active]:text-violet-50"
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
