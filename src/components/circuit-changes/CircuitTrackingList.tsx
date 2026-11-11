import { ArchiveRestore, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CIRCUIT_CHANGE_STATUS_LABELS, type CircuitChangeItem, type CircuitChangeStatus } from "./types";
import "./circuitTrackingList.css";

export const TRACKING_PAGE_SIZE = 25;
const dateFormat = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const statuses = Object.entries(CIRCUIT_CHANGE_STATUS_LABELS) as [CircuitChangeStatus, string][];

interface TrackingListProps {
  items: CircuitChangeItem[];
  total: number;
  counts: Record<CircuitChangeStatus, number>;
  status: string;
  page: number;
  busy: boolean;
  loading: boolean;
  selectedId: string;
  removedCount: number;
  filters: ReactNode;
  setPicker: ReactNode;
  onStatus: (status: CircuitChangeStatus | "all") => void;
  onPage: (page: number) => void;
  onSelect: (id: string) => void;
  onRemoved: () => void;
}

export function CircuitTrackingList({ items, total, counts, status, page, busy, loading, selectedId, removedCount, filters, setPicker, onStatus, onPage, onSelect, onRemoved }: TrackingListProps) {
  const pageCount = Math.max(1, Math.ceil(items.length / TRACKING_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * TRACKING_PAGE_SIZE;
  const visibleItems = items.slice(offset, offset + TRACKING_PAGE_SIZE);
  return <section className="circuit-tracking-list" aria-label="改善追蹤問題清單">
    <header className="circuit-tracking-list-header">
      <div><h2>問題清單</h2><p>共 {total} 項 · {total - counts.approved} 項未結案</p></div>
      <div className="circuit-tracking-list-actions">
        {setPicker}
        {removedCount > 0 && <Button data-circuit-tone="delete" type="button" variant="outline" aria-label={`已刪除的問題（${removedCount}）`} onClick={onRemoved}><ArchiveRestore aria-hidden="true" />已刪除 {removedCount} 項</Button>}
      </div>
    </header>
    <div className="circuit-tracking-counts" role="group" aria-label="各狀態問題數">
      <button type="button" aria-pressed={status === "all"} onClick={() => onStatus("all")}><span>全部問題</span><b>{total}</b></button>
      {statuses.map(([value, label]) => <button key={value} type="button" data-status={value} aria-pressed={status === value} onClick={() => onStatus(status === value ? "all" : value)}><span>{label}</span><b>{counts[value]}</b></button>)}
    </div>
    {filters}
    <div key={currentPage} className="circuit-tracking-table-scroll" aria-busy={loading}>
      <table className="circuit-tracking-table" aria-label="問題清單">
        <thead><tr><th scope="col" className="circuit-track-number">編號</th><th scope="col">問題</th><th scope="col" className="circuit-track-owner">負責人</th><th scope="col" className="circuit-track-status">狀態</th><th scope="col" className="circuit-track-date">最後更新</th></tr></thead>
        <tbody>
          {visibleItems.map(row => {
            const { title, page: sourcePage, refs, net, owner } = row.content;
            const number = `#${String(row.number).padStart(3, "0")}`;
            const location = [sourcePage && `第 ${sourcePage} 頁`, refs && `Ref ${refs}`, net && `Net ${net}`].filter(Boolean).join(" · ");
            const updatedAt = Date.parse(row.updatedAt);
            return <tr key={row.id} data-selected={row.id === selectedId}>
              <td className="circuit-track-number">{number}</td>
              <td><button type="button" data-testid="circuit-change-item" data-circuit-track-item={row.id} disabled={busy} title={`${number} ${title || "未命名問題"}`} className="circuit-track-item" onClick={() => onSelect(row.id)}>
                <strong>{title || "未命名問題"}</strong>
                <small>{location && <span title={location}>{location}</span>}<span className="circuit-track-mobile-owner">{owner || "未指定負責人"}</span></small>
              </button></td>
              <td className="circuit-track-owner" title={owner}>{owner || "未指定"}</td>
              <td className="circuit-track-status"><span className="circuit-list-status" data-status={row.status}>{CIRCUIT_CHANGE_STATUS_LABELS[row.status]}</span></td>
              <td className="circuit-track-date">{Number.isFinite(updatedAt) ? <time dateTime={row.updatedAt}>{dateFormat.format(updatedAt)}</time> : "—"}</td>
            </tr>;
          })}
          {!visibleItems.length && <tr><td className="circuit-empty" colSpan={5}>{loading ? "正在載入問題…" : total ? "目前篩選條件沒有符合的問題" : "這次改版還沒有記錄任何問題"}</td></tr>}
        </tbody>
      </table>
    </div>
    <footer className="circuit-tracking-pagination" aria-label="問題清單分頁">
      <span role="status">{items.length ? `顯示 ${offset + 1}–${offset + visibleItems.length} ／ ${items.length} 項` : "顯示 0 項"}</span>
      {pageCount > 1 && <div>
        <Button type="button" variant="outline" aria-label="問題清單上一頁" disabled={currentPage <= 1} onClick={() => onPage(currentPage - 1)}><ChevronLeft aria-hidden="true" /></Button>
        <label><span className="sr-only">問題清單跳頁</span><select value={currentPage} onChange={event => onPage(Number(event.target.value))}>{Array.from({ length: pageCount }, (_, index) => <option key={index} value={index + 1}>第 {index + 1} / {pageCount} 頁</option>)}</select></label>
        <Button type="button" variant="outline" aria-label="問題清單下一頁" disabled={currentPage >= pageCount} onClick={() => onPage(currentPage + 1)}><ChevronRight aria-hidden="true" /></Button>
      </div>}
    </footer>
  </section>;
}
