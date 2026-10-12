import type { ComponentType } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { WorkspacePreview } from "./WorkspacePreview";
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
      "surface-accent surface-accent--blue bg-[linear-gradient(180deg,rgba(16,31,56,0.94),rgba(8,18,34,0.98))] hover:border-sky-300/34",
    description: "依專案追蹤每台機台的測試進度、站點瓶頸、問題工單與實際工時。",
  },
  "file-uploads": {
    badge: "工程檔案",
    iconWrap: "border-sky-300/22 bg-sky-400/10 text-sky-100",
    panel: "surface-accent surface-accent--blue hover:border-sky-300/34",
    description: "依專案上傳、分類與共享工程檔案，保留資料夾與檔案預覽。",
  },
  "material-requests": {
    badge: "BOM 協作",
    iconWrap:
      "border-cyan-300/22 bg-cyan-400/10 text-cyan-100 shadow-[0_18px_38px_-28px_rgba(34,211,238,0.8)]",
    panel:
      "surface-accent surface-accent--teal bg-[linear-gradient(180deg,rgba(10,35,53,0.96),rgba(7,20,34,0.98))] hover:border-cyan-300/34",
    description: "查詢與維護 BOM 主料、替代料和申請狀態，保留圖片與完整協作紀錄。",
  },
  "data-center": {
    badge: "海外規劃",
    iconWrap:
      "border-violet-300/22 bg-violet-400/10 text-violet-100 shadow-[0_18px_38px_-28px_rgba(167,139,250,0.8)]",
    panel:
      "surface-accent surface-accent--violet bg-[linear-gradient(180deg,rgba(28,25,52,0.96),rgba(12,17,34,0.98))] hover:border-violet-300/34",
    description: "以 3D 數位孿生配置不同廠牌機櫃與設備，檢視冷熱通道、電力和負載。",
  },
  "pcb-designer": {
    badge: "電路設計",
    iconWrap:
      "border-emerald-300/22 bg-emerald-400/10 text-emerald-100 shadow-[0_18px_38px_-28px_rgba(52,211,153,0.8)]",
    panel:
      "surface-accent surface-accent--green bg-[linear-gradient(180deg,rgba(8,41,34,0.96),rgba(7,20,30,0.98))] hover:border-emerald-300/34",
    description: "規劃板框、元件與走線，集中管理 PCB 專案和 BOM 資料。",
  },
  "user-management": {
    badge: "權限中樞",
    iconWrap:
      "border-emerald-300/22 bg-emerald-400/10 text-emerald-100 shadow-[0_18px_38px_-28px_rgba(52,211,153,0.8)]",
    panel:
      "surface-accent surface-accent--amber bg-[linear-gradient(180deg,rgba(19,46,42,0.96),rgba(10,21,29,0.98))] hover:border-amber-300/34",
    description: "設定帳號、角色與各工作區的檢視或管理權限，集中維護 AI 服務金鑰。",
  },
  "ai-chat": {
    badge: "資料查詢",
    iconWrap:
      "border-fuchsia-300/22 bg-fuchsia-400/10 text-fuchsia-100 shadow-[0_18px_38px_-28px_rgba(232,121,249,0.8)]",
    panel:
      "surface-accent surface-accent--rose bg-[linear-gradient(180deg,rgba(43,20,60,0.96),rgba(13,17,36,0.98))] hover:border-rose-300/34",
    description: "貼上或上傳文件、圖片與長文字，交由多家 AI 模型查詢、比較和整理。",
  },
  performance: {
    badge: "人員發展",
    iconWrap:
      "border-amber-300/25 bg-amber-300/10 text-amber-100 shadow-[0_18px_38px_-28px_rgba(251,191,36,0.85)]",
    panel:
      "surface-accent surface-accent--amber bg-[linear-gradient(180deg,rgba(49,36,15,0.96),rgba(19,21,31,0.98))] hover:border-amber-300/35",
    description: "用考核週期整理目標、進度、主管回饋與評分，讓每個人的下一步清楚可追蹤。",
  },
};

const mobileWorkspaceTitleMap: Record<string, string> = {
  "station-status": "維修中心",
  "file-uploads": "檔案上傳",
  "data-center": "Data Center",
  "ai-chat": "資料查詢",
  performance: "績效考核",
};

export function WorkspaceEntrance({
  items,
  onSelect,
}: WorkspaceEntranceProps) {
  const isFiveItemLayout = items.length === 5;
  const isSixItemLayout = items.length === 6;
  const gridClass =
    items.length === 1
      ? "mx-auto max-w-xl grid-cols-1"
      : items.length === 2
        ? "grid-cols-1 lg:grid-cols-2"
        : items.length === 4
          ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
          : isFiveItemLayout
            ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-6"
            : isSixItemLayout
              ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
              : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  return (
    <section
      className="relative flex min-h-full w-full min-w-0 flex-1 flex-col px-3 py-4 sm:px-5 sm:py-5 lg:px-6 2xl:px-8"
      data-testid="workspace-entrance"
    >
      <div className="flex w-full flex-1 flex-col">
        <div className="workspace-entrance-header mb-3 flex flex-col gap-3 rounded-[1.35rem] border border-primary/15 bg-[linear-gradient(180deg,rgba(15,24,42,0.94),rgba(9,15,29,0.97))] px-4 py-3.5 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-black tracking-[-0.04em] text-foreground sm:text-3xl">
              <span className="md:hidden">我的工作區</span>
              <span className="hidden md:inline">選擇要進入的工作區</span>
            </h1>
          </div>
          <div className="hidden w-fit items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-slate-200 md:inline-flex">
            {items.length} 個入口
          </div>
        </div>

        <div
          className="workspace-entrance-mobile-list overflow-hidden rounded-[1.4rem] border border-slate-700/70 bg-[#0c1929] md:hidden"
          data-testid="workspace-entrance-mobile-list"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const tone = workspaceToneMap[item.id] ?? workspaceToneMap["station-status"];
            const mobileTitle = mobileWorkspaceTitleMap[item.id] ?? item.title;

            return (
              <button
                key={item.id}
                type="button"
                data-workspace-id={item.id}
                onClick={() => onSelect(item.id)}
                className="workspace-entrance-mobile-row group flex min-h-[76px] w-full items-center gap-3 border-b border-slate-700/55 px-3 py-2.5 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300"
              >
                <span
                  className={cn(
                    "workspace-entrance-mobile-icon grid h-12 w-12 shrink-0 place-items-center rounded-2xl border",
                    tone.iconWrap,
                  )}
                >
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-black tracking-[-0.025em] text-slate-50">
                    {mobileTitle}
                  </span>
                  <span className="mt-1 block truncate text-[12px] font-bold text-slate-400">
                    {tone.badge}
                  </span>
                </span>
                <ChevronRight className="workspace-entrance-mobile-chevron h-4 w-4 shrink-0 text-slate-500 transition-transform group-active:translate-x-0.5" />
              </button>
            );
          })}
        </div>

        <div
          className={cn(
            "hidden content-start gap-3 md:grid 2xl:gap-4",
            items.length >= 8 && "2xl:grid-cols-4",
            isFiveItemLayout && "xl:auto-rows-fr",
            gridClass,
          )}
          data-testid="workspace-entrance-grid"
        >
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
                data-workspace-id={item.id}
                className={cn(
                  "workspace-entrance-card interactive-lift group relative flex h-full min-h-[268px] flex-col overflow-hidden rounded-[1.45rem] border border-white/10 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-30px_rgba(15,23,42,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/80 motion-reduce:transform-none 2xl:p-5",
                  tone.panel,
                  layoutClass
                )}
              >
                <div className="workspace-card-heading flex min-w-0 items-center gap-2.5">
                  <div
                    className={cn(
                      "workspace-card-icon flex size-9 shrink-0 items-center justify-center rounded-xl border",
                      tone.iconWrap
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <h2 className="min-w-0 flex-1 text-[1.15rem] font-semibold leading-tight tracking-[-0.025em] text-white">
                    {item.title}
                  </h2>
                  <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-semibold text-slate-200">
                    {tone.badge}
                  </span>
                </div>

                <div className="workspace-card-body mt-3 grid min-h-0 gap-3">
                  <div className="flex min-w-0 flex-col">
                    <p className="workspace-card-description max-w-[34rem] text-sm leading-6 text-slate-200">
                      {item.description || tone.description}
                    </p>
                  </div>
                  <WorkspacePreview workspaceId={item.id} />
                </div>

                <div className="workspace-card-footer mt-3 flex items-center justify-between border-t border-white/8 pt-2 text-sm font-semibold text-slate-100 transition-colors group-hover:text-white">
                  <span className="inline-flex h-7 items-center rounded-xl px-0">
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
