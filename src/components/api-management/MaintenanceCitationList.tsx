import { ArrowUpRight, Box, CircleAlert, FolderKanban, ListChecks, MapPinned, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  MaintenanceCitation,
  MaintenanceSourceType,
  buildMaintenanceSourceHref,
} from "./maintenanceKnowledge";

const SOURCE_STYLES: Record<MaintenanceSourceType, { icon: typeof Box; className: string }> = {
  project: { icon: FolderKanban, className: "border-blue-300/20 bg-blue-400/10 text-blue-200" },
  machine: { icon: Box, className: "border-cyan-300/20 bg-cyan-400/10 text-cyan-200" },
  station: { icon: MapPinned, className: "border-violet-300/20 bg-violet-400/10 text-violet-200" },
  progress: { icon: ListChecks, className: "border-emerald-300/20 bg-emerald-400/10 text-emerald-200" },
  issue: { icon: CircleAlert, className: "border-amber-300/20 bg-amber-400/10 text-amber-200" },
  asset: { icon: Wrench, className: "border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-200" },
};

function citationExcerpt(content: string) {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > 190 ? `${text.slice(0, 190)}…` : text;
}

export function MaintenanceCitationList({ citations }: { citations: MaintenanceCitation[] }) {
  if (!citations.length) return null;

  return (
    <section className="mt-3 border-t border-cyan-300/10 pt-3" aria-label="機台維修資料來源">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
          維修資料來源
        </p>
        <span className="text-[10px] text-slate-500">{citations.length} 筆即時引用</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {citations.map((citation, index) => {
          const style = SOURCE_STYLES[citation.sourceType];
          const Icon = style.icon;
          return (
            <a
              key={`${citation.chunkId}:${index}`}
              href={buildMaintenanceSourceHref(citation)}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-slate-700/70 bg-slate-950/45 p-3 transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-slate-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            >
              <div className="flex items-start gap-2.5">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", style.className)}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                    [M{index + 1}] {citation.sourceLabel}
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{citation.projectName}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-slate-100">
                    {citation.title}
                  </span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-hover:text-cyan-200" />
              </div>
              <span className="mt-2 block text-[11px] leading-relaxed text-slate-400">
                {citationExcerpt(citation.content)}
              </span>
              <span className="mt-2 block text-[10px] font-medium text-cyan-300/80">
                查看原始資料
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
