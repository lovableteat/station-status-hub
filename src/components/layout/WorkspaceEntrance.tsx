import type { ComponentType } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileSpreadsheet,
  ImageIcon,
  KeyRound,
  Server,
  ShieldCheck,
  Thermometer,
  UsersRound,
  Zap,
} from "lucide-react";

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
    features: [string, string, string];
  }
> = {
  "station-status": {
    badge: "維修監控",
    iconWrap:
      "border-sky-300/22 bg-sky-400/10 text-sky-100 shadow-[0_18px_38px_-28px_rgba(96,165,250,0.85)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(16,31,56,0.94),rgba(8,18,34,0.98))] hover:border-sky-300/34",
    description: "依專案追蹤每台機台的測試進度、站點瓶頸、問題工單與實際工時。",
    features: ["測試進度", "生產監控", "問題與工時"],
  },
  "material-requests": {
    badge: "BOM 協作",
    iconWrap:
      "border-cyan-300/22 bg-cyan-400/10 text-cyan-100 shadow-[0_18px_38px_-28px_rgba(34,211,238,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(10,35,53,0.96),rgba(7,20,34,0.98))] hover:border-cyan-300/34",
    description: "查詢與維護 BOM 主料、替代料和申請狀態，保留圖片與完整協作紀錄。",
    features: ["BOM／替代料", "狀態追蹤", "主管報表"],
  },
  "data-center": {
    badge: "海外規劃",
    iconWrap:
      "border-violet-300/22 bg-violet-400/10 text-violet-100 shadow-[0_18px_38px_-28px_rgba(167,139,250,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(28,25,52,0.96),rgba(12,17,34,0.98))] hover:border-violet-300/34",
    description: "以 3D 數位孿生配置不同廠牌機櫃與設備，檢視冷熱通道、電力和負載。",
    features: ["3D 機櫃", "冷熱通道", "電力與散熱"],
  },
  "user-management": {
    badge: "權限中樞",
    iconWrap:
      "border-emerald-300/22 bg-emerald-400/10 text-emerald-100 shadow-[0_18px_38px_-28px_rgba(52,211,153,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(19,46,42,0.96),rgba(10,21,29,0.98))] hover:border-emerald-300/34",
    description: "設定帳號、角色與各工作區的檢視或管理權限，集中維護 AI 服務金鑰。",
    features: ["帳號與角色", "網站權限", "AI／API 金鑰"],
  },
  "ai-chat": {
    badge: "資料查詢",
    iconWrap:
      "border-fuchsia-300/22 bg-fuchsia-400/10 text-fuchsia-100 shadow-[0_18px_38px_-28px_rgba(232,121,249,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(43,20,60,0.96),rgba(13,17,36,0.98))] hover:border-fuchsia-300/34",
    description: "貼上或上傳文件、圖片與長文字，交由多家 AI 模型查詢、比較和整理。",
    features: ["100 MB 文件", "圖文貼上", "/ 共享提示詞"],
  },
};

function SegmentedProgress({
  value,
  tone = "sky",
}: {
  value: number;
  tone?: "sky" | "cyan" | "emerald";
}) {
  return (
    <div className="grid grid-cols-10 gap-1" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => {
        const isActive = index < Math.round(value / 10);
        return (
          <span
            key={index}
            className={cn(
              "h-1.5 rounded-full border border-white/5 bg-slate-800/90",
              isActive && tone === "sky" && "border-sky-300/40 bg-sky-400",
              isActive && tone === "cyan" && "border-cyan-300/40 bg-cyan-400",
              isActive && tone === "emerald" && "border-emerald-300/40 bg-emerald-400",
            )}
          />
        );
      })}
    </div>
  );
}

function WorkspacePreview({ workspaceId }: { workspaceId: string }) {
  const shellClass =
    "relative h-[122px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

  if (workspaceId === "station-status") {
    return (
      <div className={cn(shellClass, "workspace-card-preview border-sky-300/15")} aria-hidden="true">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-[0.14em] text-sky-200">LIVE TEST FLOW</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]" />
            68 台
          </span>
        </div>
        <div className="space-y-2.5">
          {[
            ["Station 0", 100, "12"],
            ["Station 1", 72, "8"],
            ["Station 2", 38, "4"],
          ].map(([label, progress, machines]) => (
            <div key={label as string} className="grid grid-cols-[68px_1fr_24px] items-center gap-2">
              <span className="truncate text-[10px] font-semibold text-slate-200">{label}</span>
              <SegmentedProgress value={progress as number} />
              <span className="text-right font-mono text-[10px] font-bold text-sky-200">{machines}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (workspaceId === "material-requests") {
    return (
      <div className={cn(shellClass, "workspace-card-preview border-cyan-300/15")} aria-hidden="true">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-cyan-200">
            <FileSpreadsheet className="h-3.5 w-3.5" /> BOM WORKSPACE
          </span>
          <span className="rounded-md bg-cyan-400/12 px-1.5 py-0.5 text-[9px] font-bold text-cyan-200">461 筆</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/45">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.65fr] gap-px bg-white/10 text-[9px] font-bold text-slate-300">
            <span className="bg-slate-900/90 px-2 py-1">料件</span>
            <span className="bg-slate-900/90 px-2 py-1">MPN</span>
            <span className="bg-slate-900/90 px-2 py-1">狀態</span>
          </div>
          {["CAP NCS X6S", "BF3 BOARD", "CX8 CABLE"].map((name, index) => (
            <div key={name} className="grid grid-cols-[1.2fr_0.8fr_0.65fr] items-center gap-px border-t border-white/5 text-[9px]">
              <span className="truncate px-2 py-1.5 font-semibold text-slate-200">{name}</span>
              <span className="truncate px-2 font-mono text-cyan-200">{index === 0 ? "TMK105" : `PN-0${index + 7}`}</span>
              <span className="mx-2 rounded-full bg-emerald-400/12 px-1.5 py-0.5 text-center font-bold text-emerald-300">完成</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (workspaceId === "data-center") {
    return (
      <div className={cn(shellClass, "workspace-card-preview border-violet-300/15")} aria-hidden="true">
        <div className="absolute inset-x-3 top-1/2 h-px bg-cyan-300/35 shadow-[0_0_12px_rgba(34,211,238,0.5)]" />
        <div className="absolute inset-x-3 bottom-7 h-px bg-amber-300/35 shadow-[0_0_12px_rgba(251,191,36,0.45)]" />
        <div className="relative flex h-full items-end justify-center gap-3 pb-1">
          {[4, 5, 4].map((slots, rackIndex) => (
            <div
              key={rackIndex}
              className={cn(
                "w-[23%] max-w-[58px] rounded-t-md border border-violet-200/25 bg-slate-950/80 p-1 shadow-[0_10px_24px_-14px_rgba(167,139,250,0.9)]",
                rackIndex === 1 ? "h-[92px]" : "h-[76px]",
              )}
            >
              <div className="mb-1 flex items-center justify-between text-violet-200">
                <Server className="h-2.5 w-2.5" />
                <span className="h-1 w-1 rounded-full bg-emerald-300" />
              </div>
              <div className="space-y-1">
                {Array.from({ length: slots }, (_, index) => (
                  <div key={index} className="h-2 rounded-[2px] border border-violet-200/10 bg-violet-300/15">
                    <span className="block h-full rounded-[2px] bg-gradient-to-r from-violet-400/55 to-cyan-300/30" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <span className="absolute left-3 top-2 inline-flex items-center gap-1 text-[9px] font-bold text-cyan-200">
          <Thermometer className="h-3 w-3" /> 24.2°C
        </span>
        <span className="absolute right-3 top-2 inline-flex items-center gap-1 text-[9px] font-bold text-amber-200">
          <Zap className="h-3 w-3" /> 52.9 kW
        </span>
      </div>
    );
  }

  if (workspaceId === "user-management") {
    return (
      <div className={cn(shellClass, "workspace-card-preview workspace-card-preview--expanded border-emerald-300/15")} aria-hidden="true">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" /> ACCESS CONTROL
          </span>
          <span className="text-[9px] font-bold text-slate-400">3 個角色</span>
        </div>
        <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
          <div className="flex items-center justify-center rounded-xl border border-white/8 bg-white/5">
            <div className="relative">
              <UsersRound className="h-9 w-9 text-emerald-200" />
              <span className="absolute -bottom-1 -right-2 rounded-full border border-slate-800 bg-emerald-400 px-1.5 py-0.5 font-mono text-[8px] font-black text-slate-950">24</span>
            </div>
          </div>
          <div className="space-y-0.5">
            {["維修中心", "料號申請", "資料查詢"].map((name, index) => (
              <div key={name} className="flex h-4 items-center justify-between rounded-md border border-white/8 bg-white/5 px-2 text-[8px] leading-none">
                <span className="font-semibold text-slate-200">{name}</span>
                <span className={cn("rounded-full px-1 py-0.5 text-[7px] font-bold", index === 1 ? "bg-sky-400/15 text-sky-200" : "bg-emerald-400/15 text-emerald-200")}>
                  {index === 1 ? "檢視" : "管理"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(shellClass, "workspace-card-preview workspace-card-preview--expanded border-fuchsia-300/15")} aria-hidden="true">
      <div className="mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-fuchsia-200">
          <Bot className="h-3.5 w-3.5" /> AI KNOWLEDGE
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> 已連線
        </span>
      </div>
      <div className="space-y-1">
        <div className="ml-auto w-[82%] rounded-xl rounded-br-sm border border-fuchsia-300/15 bg-fuchsia-400/10 px-2.5 py-1 text-[9px] font-semibold text-fuchsia-100">
          / 比較這兩份測試報告
        </div>
        <div className="mr-auto flex w-[88%] items-center gap-2 rounded-xl rounded-bl-sm border border-white/8 bg-white/5 px-2.5 py-1">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
          <span className="truncate text-[9px] font-semibold text-slate-200">已整理差異與異常項目</span>
        </div>
        <div className="flex gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-400/10 px-1.5 py-0.5 text-[8px] font-bold text-sky-200"><FileSpreadsheet className="h-2.5 w-2.5" /> Excel</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-fuchsia-400/10 px-1.5 py-0.5 text-[8px] font-bold text-fuchsia-200"><ImageIcon className="h-2.5 w-2.5" /> 圖片</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-bold text-amber-200"><KeyRound className="h-2.5 w-2.5" /> Prompt</span>
        </div>
      </div>
    </div>
  );
}

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
    <section
      className="relative flex min-h-full w-full min-w-0 flex-1 flex-col px-3 py-4 sm:px-5 sm:py-5 lg:px-6 2xl:px-8"
      data-testid="workspace-entrance"
    >
      <div className="flex w-full flex-1 flex-col">
        <div className="workspace-entrance-header mb-3 flex flex-col gap-3 rounded-[1.35rem] border border-primary/15 bg-[linear-gradient(180deg,rgba(15,24,42,0.94),rgba(9,15,29,0.97))] px-4 py-3.5 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary/75">
              Workspace
            </p>
            <h1 className="text-2xl font-black tracking-[-0.04em] text-foreground sm:text-3xl">
              選擇要進入的工作區
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              從專案維修、BOM 協作到資料分析，所有日常工作都從這裡開始。
            </p>
          </div>
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-slate-200">
            {items.length} 個入口
          </div>
        </div>

        <div
          className={cn(
            "grid flex-1 gap-3 2xl:gap-4",
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
                className={cn(
                  "workspace-entrance-card interactive-lift group relative flex h-full min-h-[268px] flex-col overflow-hidden rounded-[1.45rem] border border-white/10 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-30px_rgba(15,23,42,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/80 motion-reduce:transform-none 2xl:p-5",
                  tone.panel,
                  layoutClass
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className={cn(
                      "workspace-card-icon flex h-11 w-11 items-center justify-center rounded-xl border 2xl:h-12 2xl:w-12",
                      tone.iconWrap
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-200">
                    {tone.badge}
                  </span>
                </div>

                <div className="workspace-card-body mt-3 grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(180px,0.9fr)] 2xl:gap-4">
                  <div className="flex min-w-0 flex-col">
                    <h2 className="text-[1.45rem] font-black tracking-[-0.035em] text-white 2xl:text-[1.6rem]">
                      {item.title}
                    </h2>
                    <p className="workspace-card-description mt-1.5 max-w-[34rem] text-sm leading-6 text-slate-200">
                      {item.description || tone.description}
                    </p>
                    <div className="workspace-card-features mt-3 flex flex-wrap gap-1.5">
                      {tone.features.map((feature) => (
                        <span
                          key={feature}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-200"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                  <WorkspacePreview workspaceId={item.id} />
                </div>

                <div className="workspace-card-footer mt-3 flex items-center justify-between border-t border-white/8 pt-2 text-sm font-semibold text-slate-100 transition-colors group-hover:text-white">
                  <span className="inline-flex h-9 items-center rounded-xl px-0">
                    進入工作區
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 group-hover:text-slate-300">
                    Open workspace
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
