import { requestApplicationUpdate } from "@/lib/applicationUpdate";

export function ModuleLoadRecovery({ onRetry, onCancel }: { onRetry: () => void; onCancel?: () => void }) {
  return <section role="alert" className="m-3 rounded-xl border border-border bg-card p-4 text-foreground" data-module-load-recovery="true">
    <h2 className="font-semibold">這個功能暫時無法載入</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">可能是網路中斷或版本已更新。系統沒有重新整理頁面；未儲存內容不代表已保存，請先儲存或匯出。</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" onClick={onRetry}>重試載入此功能</button>
      {onCancel && <button type="button" className="min-h-11 rounded-lg border border-border px-4 text-sm" onClick={onCancel}>留在目前畫面</button>}
      <button type="button" className="min-h-11 rounded-lg border border-border px-4 text-sm" onClick={requestApplicationUpdate}>儲存後更新版本</button>
    </div>
  </section>;
}
