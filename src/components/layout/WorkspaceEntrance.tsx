import type { ComponentType } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface WorkspaceEntranceItem {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

interface WorkspaceEntranceProps {
  items: WorkspaceEntranceItem[];
  onSelect: (id: string) => void;
}

const workspaceToneMap: Record<
  string,
  {
    badge: string;
    iconWrap: string;
    panel: string;
    description: string;
  }
> = {
  "station-status": {
    badge: "維修監控",
    iconWrap:
      "border-sky-300/22 bg-sky-400/10 text-sky-100 shadow-[0_18px_38px_-28px_rgba(96,165,250,0.85)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(16,31,56,0.94),rgba(8,18,34,0.98))] hover:border-sky-300/34",
    description: "查看機台狀態、測試流程與維修紀錄。",
  },
  "material-requests": {
    badge: "BOM 協作",
    iconWrap:
      "border-cyan-300/22 bg-cyan-400/10 text-cyan-100 shadow-[0_18px_38px_-28px_rgba(34,211,238,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(10,35,53,0.96),rgba(7,20,34,0.98))] hover:border-cyan-300/34",
    description: "集中處理料號、替代料與 BOM 協作。",
  },
  "data-center": {
    badge: "海外規劃",
    iconWrap:
      "border-violet-300/22 bg-violet-400/10 text-violet-100 shadow-[0_18px_38px_-28px_rgba(167,139,250,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(28,25,52,0.96),rgba(12,17,34,0.98))] hover:border-violet-300/34",
    description: "規劃基櫃位置、電力與散熱資源。",
  },
  "user-management": {
    badge: "權限中樞",
    iconWrap:
      "border-emerald-300/22 bg-emerald-400/10 text-emerald-100 shadow-[0_18px_38px_-28px_rgba(52,211,153,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(19,46,42,0.96),rgba(10,21,29,0.98))] hover:border-emerald-300/34",
    description: "管理使用者、工程師與工作區權限。",
  },
  "ai-chat": {
    badge: "生成協作",
    iconWrap:
      "border-fuchsia-300/22 bg-fuchsia-400/10 text-fuchsia-100 shadow-[0_18px_38px_-28px_rgba(232,121,249,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(43,20,60,0.96),rgba(13,17,36,0.98))] hover:border-fuchsia-300/34",
    description: "直接進入 AI 對話空間，延續上下文與生成內容。",
  },
};

export function WorkspaceEntrance({
  items,
  onSelect,
}: WorkspaceEntranceProps) {
  const isFiveItemLayout = items.length === 5;
  const gridClass =
    items.length === 1
      ? "mx-auto max-w-xl grid-cols-1"
      : items.length === 2
        ? "grid-cols-1 lg:grid-cols-2"
        : items.length === 4
          ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
          : isFiveItemLayout
            ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-6"
            : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  return (
    <section className="relative w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="mb-5 flex flex-col gap-3 rounded-[1.6rem] border border-primary/12 bg-[linear-gradient(180deg,rgba(15,24,42,0.92),rgba(9,15,29,0.96))] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary/75">
              Workspace
            </p>
            <h1 className="text-3xl font-black tracking-[-0.04em] text-foreground sm:text-4xl">
              選擇要進入的工作區
            </h1>
          </div>
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-slate-200">
            {items.length} 個入口
          </div>
        </div>

        <div className={cn("grid gap-5", gridClass)}>
          {items.map((item) => {
            const Icon = item.icon;
            const tone = workspaceToneMap[item.id] ?? workspaceToneMap["station-status"];
            const layoutClass = isFiveItemLayout
              ? items.indexOf(item) < 3
                ? "xl:col-span-2"
                : "xl:col-span-3"
              : "";

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "interactive-lift group relative flex min-h-[238px] flex-col justify-between overflow-hidden rounded-[1.8rem] border border-white/10 p-6 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-30px_rgba(15,23,42,0.9)]",
                  tone.panel,
                  layoutClass
                )}
              >
                <div className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-[1.2rem] border",
                        tone.iconWrap
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-200">
                      {tone.badge}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <h2 className="text-[2rem] font-black tracking-[-0.04em] text-white">
                      {item.title}
                    </h2>
                    <p className="max-w-[28rem] text-[15px] leading-7 text-slate-300">
                      {item.description || tone.description}
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center pt-6 text-sm font-semibold text-slate-100 transition-colors group-hover:text-white">
                  <span className="inline-flex h-11 items-center rounded-xl px-0">
                    進入工作區
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
