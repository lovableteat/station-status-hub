import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, GitBranch, Server, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface MaintenanceProjectSetupProps {
  actions?: ReactNode;
  hasPublishedFlow: boolean;
  onOpenFlow: () => void;
  projectName: string;
}

export function MaintenanceProjectSetup({
  actions,
  hasPublishedFlow,
  onOpenFlow,
  projectName,
}: MaintenanceProjectSetupProps) {
  return (
    <section className="maintenance-panel overflow-hidden">
      <div className="flex flex-col gap-5 border-b border-[#2a526f]/70 bg-[#0d2135] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-300 text-[#06111f]">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-[#f3f8fc]">專案工作區已建立</h2>
              <Badge variant="outline" className="border-cyan-300/35 bg-cyan-300/10 text-cyan-100">
                {projectName}
              </Badge>
            </div>
            <p className="mt-1 max-w-[62ch] text-sm leading-6 text-[#b8cfdd]">
              這不是載入失敗。此專案目前尚未加入機台，依序確認流程、建立機台後即可開始追蹤。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-cyan-300/40 bg-[#10263a]" onClick={onOpenFlow}>
            <GitBranch className="mr-2 h-4 w-4" />
            {hasPublishedFlow ? "檢查測試流程" : "設定測試流程"}
          </Button>
          {actions}
        </div>
      </div>

      <div className="grid divide-y divide-[#2a526f]/55 md:grid-cols-3 md:divide-x md:divide-y-0">
        {[
          {
            done: hasPublishedFlow,
            icon: GitBranch,
            label: "確認 L10 流程",
            copy: hasPublishedFlow ? "流程已就緒，可開始建立機台。" : "先建立站點與測項，儲存後立即生效。",
          },
          {
            done: false,
            icon: Server,
            label: "加入專案機台",
            copy: "輸入機台編號、序號與負責工程師。",
          },
          {
            done: false,
            icon: ArrowRight,
            label: "開始測試追蹤",
            copy: "機台建立後，進度矩陣與監控牆會立即顯示。",
          },
        ].map((step, index) => {
          const Icon = step.done ? CheckCircle2 : step.icon;
          return (
            <div key={step.label} className="flex min-h-28 gap-3 px-5 py-4">
              <div className="font-data flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#10263a] text-sm text-cyan-100">
                {step.done ? <Icon className="h-4 w-4 text-emerald-200" /> : index + 1}
              </div>
              <div>
                <h3 className="font-semibold text-[#f3f8fc]">{step.label}</h3>
                <p className="mt-1 text-sm leading-5 text-[#9eb8ca]">{step.copy}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
