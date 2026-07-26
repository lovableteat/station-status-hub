import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeftRight,
  Check,
  LayoutTemplate,
  MousePointer2,
  Snowflake,
  ThermometerSun,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import type {
  FacilityAisleKind,
  FacilityAisleOrientation,
  RackPlan,
} from "./dataCenterTypes";

export type FacilityAisleCreationRequest = {
  mode: "automatic" | "free";
  kind: FacilityAisleKind;
  orientation: FacilityAisleOrientation;
  rackIds: string[];
};

interface FacilityAisleCreationDialogProps {
  open: boolean;
  racks: RackPlan[];
  onOpenChange: (open: boolean) => void;
  onCreate: (request: FacilityAisleCreationRequest) => void;
}

const DEFAULT_DRAFT: FacilityAisleCreationRequest = {
  mode: "automatic",
  kind: "cold",
  orientation: "horizontal",
  rackIds: [],
};

export function FacilityAisleCreationDialog({
  open,
  racks,
  onOpenChange,
  onCreate,
}: FacilityAisleCreationDialogProps) {
  const [draft, setDraft] = useState<FacilityAisleCreationRequest>(
    DEFAULT_DRAFT
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft({
      ...DEFAULT_DRAFT,
      rackIds: racks.map((rack) => rack.id),
    });
    setError("");
  }, [open, racks]);

  const selectedRackCount = draft.rackIds.length;
  const allSelected = racks.length > 0 && selectedRackCount === racks.length;
  const canSubmit = draft.mode === "free" || selectedRackCount > 0;
  const selectedRackIds = useMemo(
    () => new Set(draft.rackIds),
    [draft.rackIds]
  );

  const updateDraft = (
    patch: Partial<FacilityAisleCreationRequest>
  ) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  };

  const toggleRack = (rackId: string) => {
    updateDraft({
      rackIds: selectedRackIds.has(rackId)
        ? draft.rackIds.filter((id) => id !== rackId)
        : [...draft.rackIds, rackId],
    });
  };

  const submit = () => {
    if (!canSubmit) {
      setError("自動配置至少需要選擇一座機櫃。");
      return;
    }
    onCreate(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88dvh,760px)] w-[min(94vw,720px)] max-w-none flex-col gap-0 overflow-hidden border-cyan-300/20 bg-[#071522] p-0 text-slate-100 sm:max-w-[720px]">
        <DialogHeader className="border-b border-white/10 px-6 py-5 pr-14 text-left">
          <DialogTitle className="flex items-center gap-2 text-white">
            <LayoutTemplate className="h-5 w-5 text-cyan-300" />
            新增冷熱通道
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            可讓系統依機櫃範圍自動畫通道，或先放到畫布中央再自由拖曳。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y divide-white/10 px-6">
            <section className="py-5">
              <h3 className="text-xs font-black text-cyan-100">配置方式</h3>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">
                自動配置會涵蓋所選機櫃並預留兩端空間；自由配置可直接在 2D 畫布調整。
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {([
                  {
                    id: "automatic",
                    label: "自動畫通道",
                    detail: "依選取機櫃計算位置與長度",
                    icon: LayoutTemplate,
                  },
                  {
                    id: "free",
                    label: "自由配置",
                    detail: "置中新增後自行拖曳與縮放",
                    icon: MousePointer2,
                  },
                ] as const).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={draft.mode === option.id}
                    onClick={() => updateDraft({ mode: option.id })}
                    className={cn(
                      "flex min-h-20 items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200",
                      draft.mode === option.id
                        ? "border-cyan-200/65 bg-cyan-300/12 text-white"
                        : "border-white/12 bg-white/[0.03] text-slate-300 hover:border-cyan-200/30 hover:bg-white/[0.06]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        draft.mode === option.id
                          ? "bg-cyan-300 text-[#04131f]"
                          : "bg-white/8 text-slate-300"
                      )}
                    >
                      <option.icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-black">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-[11px] leading-4 text-slate-400">
                        {option.detail}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-xs font-black text-cyan-100">通道類型</h3>
                  <div className="mt-3 flex gap-2">
                    {([
                      { id: "cold", label: "冷通道", icon: Snowflake },
                      { id: "hot", label: "熱通道", icon: ThermometerSun },
                    ] as const).map((option) => (
                      <Button
                        key={option.id}
                        type="button"
                        variant="outline"
                        aria-pressed={draft.kind === option.id}
                        onClick={() => updateDraft({ kind: option.id })}
                        className={cn(
                          "h-10 flex-1",
                          draft.kind === option.id
                            ? option.id === "cold"
                              ? "border-sky-200/65 bg-sky-400/18 text-sky-50"
                              : "border-orange-200/65 bg-orange-400/18 text-orange-50"
                            : "border-white/12 bg-white/[0.03] text-slate-300"
                        )}
                      >
                        <option.icon className="mr-2 h-4 w-4" />
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-black text-cyan-100">通道方向</h3>
                  <div className="mt-3 flex gap-2">
                    {([
                      {
                        id: "horizontal",
                        label: "橫向",
                        icon: ArrowLeftRight,
                      },
                      {
                        id: "vertical",
                        label: "直向",
                        icon: ArrowDownUp,
                      },
                    ] as const).map((option) => (
                      <Button
                        key={option.id}
                        type="button"
                        variant="outline"
                        aria-pressed={draft.orientation === option.id}
                        onClick={() =>
                          updateDraft({ orientation: option.id })
                        }
                        className={cn(
                          "h-10 flex-1",
                          draft.orientation === option.id
                            ? "border-cyan-200/65 bg-cyan-300/12 text-cyan-50"
                            : "border-white/12 bg-white/[0.03] text-slate-300"
                        )}
                      >
                        <option.icon className="mr-2 h-4 w-4" />
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {draft.mode === "automatic" ? (
              <section className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-black text-cyan-100">
                      套用機櫃
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-400">
                      已選 {selectedRackCount} / {racks.length} 座機櫃
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={allSelected}
                      onClick={() =>
                        updateDraft({ rackIds: racks.map((rack) => rack.id) })
                      }
                      className="h-8 border-white/12 bg-white/[0.03] text-xs text-slate-200"
                    >
                      全部機櫃
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={selectedRackCount === 0}
                      onClick={() => updateDraft({ rackIds: [] })}
                      className="h-8 px-2 text-xs text-slate-400 hover:bg-white/8 hover:text-white"
                    >
                      清除
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {racks.map((rack) => {
                    const selected = selectedRackIds.has(rack.id);
                    return (
                      <button
                        key={rack.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleRack(rack.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200",
                          selected
                            ? "border-cyan-200/45 bg-cyan-300/10 text-white"
                            : "border-white/10 bg-black/15 text-slate-300 hover:border-white/20"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                            selected
                              ? "border-cyan-200 bg-cyan-300 text-[#04131f]"
                              : "border-white/20 bg-black/20"
                          )}
                        >
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-black">
                            {rack.cabinet}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                            {rack.zone} · {rack.row}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {error || selectedRackCount === 0 ? (
                  <p role="alert" className="mt-3 text-xs font-bold text-rose-200">
                    {error || "自動配置至少需要選擇一座機櫃。"}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-white/10 bg-black/20 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/12 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] hover:text-white"
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="bg-cyan-300 font-black text-[#04131f] hover:bg-cyan-200"
          >
            {draft.mode === "automatic" ? "自動畫通道" : "加入自由通道"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
