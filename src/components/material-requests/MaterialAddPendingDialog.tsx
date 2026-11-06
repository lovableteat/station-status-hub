import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isTrackedMaterialApplication } from "./materialTrackingStatus";
import type { MaterialRecord } from "./materialRequestUtils";

const RESULT_LIMIT = 50;

export function MaterialAddPendingDialog({ records, workspaceName, canSave, onClose, onAdd }: {
  records: readonly MaterialRecord[];
  workspaceName: string;
  canSave: boolean;
  onClose: () => void;
  onAdd: (recordId: string) => Promise<void>;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const deferredQuery = useDeferredValue(query);
  const candidates = useMemo(() => records.filter(record => !record.applicationExempt).map(record => ({
    record,
    searchText: [record.refDes, record.refGroup, record.name, record.partName, record.manufacturer, record.manufacturerPartNumber, record.manufacturerPartNumberAlt, record.partNumber, record.virtualAlternative].join(" ").toLowerCase(),
  })), [records]);
  const matches = useMemo(() => {
    const terms = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return candidates.filter(({ searchText }) => terms.every(term => searchText.includes(term)));
  }, [candidates, deferredQuery]);
  const selected = matches.find(({ record }) => record.id === selectedId)?.record;

  async function submit() {
    if (!canSave || !selected || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onAdd(selected.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "加入失敗，請稍後再試。");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !savingRef.current) onClose(); }}>
    <DialogContent className="flex max-h-[85dvh] w-[min(92vw,36rem)] max-w-xl flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>新增為待處理料</DialogTitle>
        <DialogDescription>{workspaceName} · 選取一筆料件加入「其他」。</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <label htmlFor={searchId} className="sr-only">搜尋要加入的料件</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id={searchId} autoFocus placeholder="搜尋位號、料名、料號或廠商" value={query} disabled={saving} onChange={event => { setQuery(event.target.value); setSelectedId(""); setError(""); }} className="pl-9" />
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">{matches.length > RESULT_LIMIT ? `顯示前 ${RESULT_LIMIT} 筆，共 ${matches.length.toLocaleString()} 筆` : `共 ${matches.length} 筆料件`}</p>
      </div>
      <div className="min-h-0 overflow-y-auto rounded-md border border-border" aria-label="可加入的料件">
        {matches.length === 0 && <p className="p-4 text-sm text-muted-foreground">沒有符合的料件。</p>}
        {matches.slice(0, RESULT_LIMIT).map(({ record }) => {
          const active = selectedId === record.id;
          return <button key={record.id} type="button" aria-pressed={active} disabled={saving} onClick={() => { setSelectedId(record.id); setError(""); }} className={cn("flex min-h-14 w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary", active && "bg-primary/15")}>
            <span className="min-w-0 flex-1">
              <strong className="block break-words text-sm">{[record.refDes || record.refGroup, record.manufacturerPartNumber, record.manufacturer].filter(Boolean).join(" · ") || record.name}</strong>
              <span className="block break-words text-xs text-muted-foreground">{record.name}{record.partNumber ? ` · ${record.partNumber}` : ""}</span>
            </span>
            {isTrackedMaterialApplication(record) && <span className="shrink-0 text-xs text-muted-foreground">已追蹤</span>}
            {active && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
          </button>;
        })}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>取消</Button>
        <Button type="button" disabled={!canSave || !selected || saving} onClick={() => void submit()}><Plus className="size-4" />{saving ? "正在加入…" : "加入其他"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
