import { useEffect, useId, useState } from "react";
import { Files } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { loadMaterialSpecBomOptions } from "./materialSpecKnowledgeService";
import type { MaterialSpecBom } from "./materialSpecKnowledge";

export function MaterialSpecSourceSelector({ enabled, onEnabledChange, scope, onScopeChange, allowed, ownerId, loading, progress }: {
  enabled: boolean; onEnabledChange: (value: boolean) => void; scope: string; onScopeChange: (value: string) => void;
  allowed: boolean; ownerId?: string; loading: boolean; progress: string;
}) {
  const id = useId();
  const [boms, setBoms] = useState<MaterialSpecBom[]>([]), [error, setError] = useState("");
  useEffect(() => {
    setBoms([]); setError("");
    if (!enabled || !allowed) return;
    const controller = new AbortController();
    void loadMaterialSpecBomOptions(controller.signal).then(items => { if (!controller.signal.aborted) setBoms(items); }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "無法載入 BOM"); });
    return () => controller.abort();
  }, [enabled, allowed, ownerId]);
  return <section data-testid="material-spec-source" className="mt-2 rounded-xl border border-primary/25 bg-background/45 px-3 py-2">
    <div className="flex min-w-0 items-center gap-3">
      <Files className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-semibold">料號／SPEC</label>
        <p className="text-xs text-muted-foreground">{!allowed ? "目前帳號沒有料號系統讀取權限" : enabled ? "全部附件格式均納入，逐檔顯示讀取結果" : "關閉中 · 開啟後可查詢料號與 SPEC 內容"}</p>
      </div>
      <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center lg:min-h-0">
        <Switch id={id} aria-label="啟用料號與 SPEC 來源" checked={enabled && allowed} disabled={!allowed || loading} onCheckedChange={onEnabledChange} />
      </label>
    </div>
    {enabled && allowed && <div className="mt-2 space-y-2"><label className="flex items-center gap-2 text-xs">BOM 範圍<select aria-label="料號 SPEC 的 BOM 範圍" value={scope} disabled={loading} onChange={event => onScopeChange(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 text-foreground"><option value="all">全部可讀 BOM（{boms.length} 份，含歷史／封存）</option>{boms.map(bom => <option key={bom.id} value={bom.id}>{bom.name}</option>)}</select></label><details className="text-xs leading-5 text-muted-foreground"><summary className="cursor-pointer py-1">附件讀取方式與限制</summary><p>送出時會讀取此範圍的全部 SPEC，再依問題選取內容交給所選 AI。圖片／掃描頁可能需要額外 AI 判讀；無法完整轉換的原生格式與容量限制會逐檔列明。</p></details></div>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {enabled && progress && <p role="status" className="mt-2 text-xs text-primary">{progress}</p>}
  </section>;
}
