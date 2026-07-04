import type { ComponentType } from "react";
import { ArrowRight, Orbit, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    glow: string;
    iconWrap: string;
    panel: string;
  }
> = {
  "station-status": {
    badge: "現場監控",
    glow:
      "before:absolute before:right-[-5rem] before:top-[-5rem] before:h-40 before:w-40 before:rounded-full before:bg-blue-400/18 before:blur-3xl",
    iconWrap:
      "border-blue-300/20 bg-blue-400/10 text-blue-100 shadow-[0_18px_38px_-28px_rgba(96,165,250,0.85)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(16,31,56,0.94),rgba(8,18,34,0.98))] hover:border-blue-300/32",
  },
  "material-requests": {
    badge: "BOM 協作",
    glow:
      "before:absolute before:right-[-5rem] before:top-[-5rem] before:h-40 before:w-40 before:rounded-full before:bg-cyan-400/18 before:blur-3xl",
    iconWrap:
      "border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[0_18px_38px_-28px_rgba(34,211,238,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(10,35,53,0.96),rgba(7,20,34,0.98))] hover:border-cyan-300/30",
  },
  "data-center": {
    badge: "海外規劃",
    glow:
      "before:absolute before:right-[-5rem] before:top-[-5rem] before:h-40 before:w-40 before:rounded-full before:bg-violet-400/18 before:blur-3xl",
    iconWrap:
      "border-violet-300/20 bg-violet-400/10 text-violet-100 shadow-[0_18px_38px_-28px_rgba(167,139,250,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(28,25,52,0.96),rgba(12,17,34,0.98))] hover:border-violet-300/30",
  },
  "user-management": {
    badge: "權限中樞",
    glow:
      "before:absolute before:right-[-5rem] before:top-[-5rem] before:h-40 before:w-40 before:rounded-full before:bg-emerald-400/18 before:blur-3xl",
    iconWrap:
      "border-emerald-300/20 bg-emerald-400/10 text-emerald-100 shadow-[0_18px_38px_-28px_rgba(52,211,153,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(19,46,42,0.96),rgba(10,21,29,0.98))] hover:border-emerald-300/30",
  },
  "ai-chat": {
    badge: "生成協作",
    glow:
      "before:absolute before:right-[-5rem] before:top-[-5rem] before:h-40 before:w-40 before:rounded-full before:bg-fuchsia-400/18 before:blur-3xl",
    iconWrap:
      "border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100 shadow-[0_18px_38px_-28px_rgba(232,121,249,0.8)]",
    panel:
      "bg-[linear-gradient(180deg,rgba(43,20,60,0.96),rgba(13,17,36,0.98))] hover:border-fuchsia-300/30",
  },
};

export function WorkspaceEntrance({
  items,
  onSelect,
}: WorkspaceEntranceProps) {
  const gridClass =
    items.length === 1
      ? "mx-auto max-w-md"
      : items.length === 2
        ? "mx-auto max-w-4xl md:grid-cols-2"
        : "md:grid-cols-2 xl:grid-cols-3";

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-92px)] w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-8 -z-10 h-[28rem] overflow-hidden">
        <div className="absolute left-[8%] top-10 h-48 w-48 rounded-full bg-primary/16 blur-3xl" />
        <div className="absolute right-[10%] top-0 h-56 w-56 rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full bg-violet-400/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_340px]">
          <div className="panel-surface relative overflow-hidden rounded-[2rem] border-primary/18 bg-[linear-gradient(135deg,rgba(16,28,52,0.96),rgba(10,18,34,0.98))] px-6 py-7 sm:px-8 sm:py-8">
            <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.16),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.08),transparent_45%)] xl:block" />

            <div className="relative space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-primary/90">
                <Sparkles className="h-3.5 w-3.5" />
                Workspace Navigation
              </div>

              <div className="max-w-3xl space-y-3">
                <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground sm:text-5xl">
                  選擇要進入的工作區
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  保留最直接的操作入口，不塞概覽頁。登入後直接選工作區，再進到對應功能，
                  讓站點管理、料號協作、權限控制與 AI 對話空間都各自清楚獨立。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-100">
                  <Orbit className="h-4 w-4 text-cyan-200" />
                  {items.length} 個工作區入口
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-100">
                  <ShieldCheck className="h-4 w-4 text-emerald-200" />
                  入口與功能分流
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-100">
                  <Sparkles className="h-4 w-4 text-violet-200" />
                  保留現有邏輯
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/28 px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Active Portal
                  </p>
                  <p className="mt-3 text-3xl font-black text-slate-50">{items.length}</p>
                  <p className="mt-2 text-sm text-slate-400">首頁只保留主入口，切換更直接。</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/28 px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Permission Split
                  </p>
                  <p className="mt-3 text-lg font-black text-slate-50">Workspace First</p>
                  <p className="mt-2 text-sm text-slate-400">先進工作區，再打開對應模組與控制台。</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/28 px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    AI Access
                  </p>
                  <p className="mt-3 text-lg font-black text-slate-50">AI 對話空間</p>
                  <p className="mt-2 text-sm text-slate-400">把對話入口獨立出來，後續更好擴充。</p>
                </div>
              </div>
            </div>
          </div>

          <aside className="panel-surface rounded-[2rem] border-primary/15 bg-[linear-gradient(180deg,rgba(12,20,38,0.96),rgba(9,15,29,0.98))] p-5">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">
                  Quick Access
                </p>
                <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-50">
                  主要入口總覽
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  不更動原本流程，只把入口整理得更清楚，未來新增工作區也能繼續沿用。
                </p>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => {
                  const Icon = item.icon;
                  const tone = workspaceToneMap[item.id] ?? workspaceToneMap["station-status"];

                  return (
                    <button
                      key={`${item.id}-quick`}
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className="interactive-lift flex w-full items-center gap-3 rounded-[1.35rem] border border-white/8 bg-slate-950/24 px-4 py-3 text-left hover:border-primary/28 hover:bg-white/5"
                    >
                      <div
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                          tone.iconWrap
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-bold text-slate-50">{item.title}</p>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                            #{index + 1}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">{tone.badge}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>

        <div className={cn("grid gap-5", gridClass)}>
          {items.map((item) => {
            const Icon = item.icon;
            const tone = workspaceToneMap[item.id] ?? workspaceToneMap["station-status"];

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "interactive-lift group panel-surface relative flex h-full min-h-[19rem] flex-col justify-between overflow-hidden rounded-[2rem] border p-6 text-left",
                  tone.panel,
                  tone.glow
                )}
              >
                <div className="relative space-y-6">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-[1.25rem] border",
                        tone.iconWrap
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-200">
                      {tone.badge}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <h2 className="text-[2rem] font-black tracking-[-0.04em] text-white">
                      {item.title}
                    </h2>
                    <p className="max-w-sm text-sm leading-7 text-slate-300">
                      {item.description}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.15rem] border border-white/8 bg-black/14 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                        Entry mode
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-100">直接進入</p>
                    </div>
                    <div className="rounded-[1.15rem] border border-white/8 bg-black/14 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                        Flow
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-100">入口分流</p>
                    </div>
                  </div>
                </div>

                <div className="relative pt-8">
                  <Button
                    variant="ghost"
                    className="h-11 rounded-xl px-0 text-sm font-semibold text-slate-100 hover:bg-transparent hover:text-white"
                  >
                    進入工作區
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </Button>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
