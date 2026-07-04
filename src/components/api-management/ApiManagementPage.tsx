import { useState } from "react";
import {
  Database,
  FileCode2,
  KeyRound,
  MessageSquareText,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ApiChatConsole } from "./ApiChatConsole";
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
    title: "AI 對話空間",
    description: "選好 API 金鑰後直接連續對話，不是一次性測試，適合即時驗證模型與回覆品質。",
    icon: MessageSquareText,
    tone: "from-sky-500/18 via-indigo-500/12 to-transparent",
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

  const handleChatKey = (record: ApiKeyRecord) => {
    setSelectedApiKey(record);
    setActiveTab("chat");
  };

  return (
    <div className="space-y-6 p-6">
      <section className="overflow-hidden rounded-[28px] border border-blue-400/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_35%),linear-gradient(180deg,#121b30_0%,#0b1323_100%)]">
        <div className="space-y-6 p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
                <ServerCog className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-50">
                  API 控制台
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  這裡是整個網站對外串接與 AI 呼叫的控制區。你可以管理金鑰、直接測試內外部 API、
                  用選定模型持續對話，並整理交給外部系統的串接文件。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-blue-400/15 bg-slate-950/25 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/80">
                  Auth
                </p>
                <p className="mt-2 text-base font-bold text-slate-50">API Key / Provider Key</p>
              </div>
              <div className="rounded-2xl border border-blue-400/15 bg-slate-950/25 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/80">
                  Scope
                </p>
                <p className="mt-2 text-base font-bold text-slate-50">內部 API + 外部 AI API</p>
              </div>
              <div className="rounded-2xl border border-blue-400/15 bg-slate-950/25 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200/80">
                  Status
                </p>
                <p className="mt-2 flex items-center gap-2 text-base font-bold text-slate-50">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  可直接測試 / 對話
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;

              return (
                <article
                  key={card.title}
                  className={`rounded-3xl border border-blue-400/15 bg-gradient-to-br ${card.tone} p-5`}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-0.5 rounded-2xl border border-white/10 bg-slate-950/20 p-3 text-slate-100">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-50">{card.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
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
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl border border-blue-400/15 bg-[#10192c] p-2 text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
          <TabsTrigger
            value="keys"
            className="rounded-xl border border-transparent py-2.5 text-sm font-bold data-[state=active]:border-cyan-400/20 data-[state=active]:bg-cyan-400/12 data-[state=active]:text-cyan-100"
          >
            金鑰管理
          </TabsTrigger>
          <TabsTrigger
            value="chat"
            className="rounded-xl border border-transparent py-2.5 text-sm font-bold data-[state=active]:border-sky-400/20 data-[state=active]:bg-sky-400/12 data-[state=active]:text-sky-100"
          >
            AI 對話空間
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="rounded-xl border border-transparent py-2.5 text-sm font-bold data-[state=active]:border-emerald-400/20 data-[state=active]:bg-emerald-400/12 data-[state=active]:text-emerald-100"
          >
            API 測試
          </TabsTrigger>
          <TabsTrigger
            value="docs"
            className="rounded-xl border border-transparent py-2.5 text-sm font-bold data-[state=active]:border-violet-400/20 data-[state=active]:bg-violet-400/12 data-[state=active]:text-violet-100"
          >
            API 文件
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="mt-0">
          <ApiKeyManagement onTestKey={handleTestKey} onChatKey={handleChatKey} />
        </TabsContent>

        <TabsContent value="chat" className="mt-0">
          <ApiChatConsole selectedApiKey={selectedApiKey} />
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
