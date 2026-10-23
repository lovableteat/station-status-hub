import { useEffect } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTestPlanFileSize } from "./core/files";
import { transferPercent } from "./core/transfers";

export interface UploadProgressView {
  completed: number;
  total: number;
  uploadedBytes: number;
  totalBytes: number;
  currentFileName: string;
}

export interface TransferItem {
  id: string;
  name: string;
  loaded: number;
  total: number;
  status: "active" | "done" | "error" | "cancelled";
  message?: string;
  cancel?: () => void;
  /** Small text next to the kind, e.g. 準備拖到桌面. */
  detail?: string;
}

interface Props {
  uploads: UploadProgressView | null;
  downloads: TransferItem[];
  onDismiss: (id: string) => void;
}

const DONE_TTL = 6000;

/**
 * Floating transfer panel: one oversized percentage for the transfer in
 * progress, then compact rows for the rest. Uploads come from the workspace
 * hook; downloads are tracked here while they stream to disk.
 */
export function TransferPanel({ uploads, downloads, onDismiss }: Props) {
  useEffect(() => {
    const finished = downloads.filter((item) => item.status !== "active");
    if (!finished.length) return;
    const timers = finished.map((item) => setTimeout(() => onDismiss(item.id), DONE_TTL));
    return () => timers.forEach(clearTimeout);
  }, [downloads, onDismiss]);

  if (!uploads && downloads.length === 0) return null;

  const rows: Array<{ key: string; kind: "upload" | "download"; name: string; loaded: number; total: number; status: TransferItem["status"]; message?: string; cancel?: () => void; dismiss?: () => void; detail?: string }> = [];
  if (uploads) {
    rows.push({
      key: "upload", kind: "upload", name: uploads.currentFileName || "準備上傳…", loaded: uploads.uploadedBytes, total: uploads.totalBytes, status: "active",
      detail: `第 ${Math.min(uploads.completed + 1, Math.max(uploads.total, 1))}／${uploads.total} 個檔案`,
    });
  }
  for (const item of downloads) {
    rows.push({ key: item.id, kind: "download", name: item.name, loaded: item.loaded, total: item.total, status: item.status, message: item.message, cancel: item.cancel, dismiss: () => onDismiss(item.id), detail: item.detail });
  }
  const [lead, ...rest] = [...rows.filter((row) => row.status === "active"), ...rows.filter((row) => row.status !== "active")];
  const activeCount = rows.filter((row) => row.status === "active").length;

  return (
    <aside className="file-library-transfers" role="status" aria-live="polite" aria-label="檔案傳輸進度" data-testid="file-library-transfers">
      <header className="file-library-transfers-head">
        <strong>{activeCount > 0 ? `傳輸中 · ${activeCount} 項` : "傳輸完成"}</strong>
        <span>{rows.length} 項</span>
      </header>
      {lead && <TransferLead row={lead} />}
      {rest.length > 0 && (
        <ul className="file-library-transfer-list">
          {rest.map((row) => (
            <li key={row.key} className={cn("file-library-transfer-row", `is-${row.status}`)}>
              <span className="file-library-transfer-row-kind" aria-hidden="true">{row.kind === "upload" ? <ArrowUpFromLine /> : <ArrowDownToLine />}</span>
              <span className="file-library-transfer-row-name" title={row.name}>{row.name}</span>
              <span className="file-library-transfer-row-percent">{row.status === "active" ? `${transferPercent(row.loaded, row.total)}%` : row.status === "done" ? "完成" : row.status === "error" ? "失敗" : "已取消"}</span>
              <span className="file-library-transfer-row-bar" aria-hidden="true"><span style={{ width: `${row.status === "done" ? 100 : transferPercent(row.loaded, row.total)}%` }} /></span>
              {row.status === "active" && row.cancel && <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`取消 ${row.name}`} onClick={row.cancel}><X className="h-4 w-4" /></Button>}
              {row.status !== "active" && row.dismiss && <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`關閉 ${row.name}`} onClick={row.dismiss}><X className="h-4 w-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function TransferLead({ row }: { row: { kind: "upload" | "download"; name: string; loaded: number; total: number; status: TransferItem["status"]; message?: string; cancel?: () => void; dismiss?: () => void; detail?: string } }) {
  const percent = row.status === "done" ? 100 : transferPercent(row.loaded, row.total);
  const unknownSize = row.status === "active" && row.total <= 0;
  return (
    <div className={cn("file-library-transfer-lead", `is-${row.status}`, unknownSize && "is-indeterminate")}>
      <div className="file-library-transfer-lead-top">
        <span className="file-library-transfer-kind">{row.kind === "upload" ? <><ArrowUpFromLine />上傳</> : <><ArrowDownToLine />下載</>}{row.detail ? <small>{row.detail}</small> : null}</span>
        {row.status === "active" && row.cancel && <Button type="button" variant="outline" size="sm" onClick={row.cancel}>取消</Button>}
        {row.status !== "active" && row.dismiss && <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="關閉" onClick={row.dismiss}><X className="h-4 w-4" /></Button>}
      </div>
      <div className="file-library-transfer-percent" aria-label={`${percent}%`}>
        {row.status === "done" ? <><Check />完成</> : row.status === "error" ? <><AlertTriangle />失敗</> : row.status === "cancelled" ? "已取消" : unknownSize ? "…" : <>{percent}<small>%</small></>}
      </div>
      <div className="file-library-transfer-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      <p className="file-library-transfer-name" title={row.name}>{row.name}</p>
      <p className="file-library-transfer-bytes">
        {row.status === "error" && row.message
          ? row.message
          : row.total > 0
            ? `${formatTestPlanFileSize(Math.min(row.loaded, row.total))} / ${formatTestPlanFileSize(row.total)}`
            : row.loaded > 0 ? `${formatTestPlanFileSize(row.loaded)} 已傳輸` : "正在連線…"}
      </p>
    </div>
  );
}
