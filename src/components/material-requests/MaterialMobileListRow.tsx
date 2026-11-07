import { ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import "./materialMobileList.css";

export interface MaterialMobileListRowProps {
  virtualNumber: string;
  physicalNumber: string;
  showVirtual: boolean;
  showPhysical: boolean;
  status: string;
  statusTone: string;
  marked: boolean;
  markDisabled: boolean;
  fields: Array<{ key: string; label: string; value: string }>;
  onToggleMarked: () => void;
  onOpen: () => void;
  onTracking: () => void;
  recordId: string;
}

export function MaterialMobileListRow({
  virtualNumber, physicalNumber, showVirtual, showPhysical, status, statusTone,
  marked, markDisabled, fields, onToggleMarked, onOpen, onTracking, recordId,
}: MaterialMobileListRowProps) {
  return (
    <article className="material-mobile-list-row" data-testid="material-mobile-list-row" data-record-id={recordId}>
      <button
        type="button"
        className={cn("material-mobile-list-mark", marked && "is-marked")}
        onClick={onToggleMarked}
        disabled={markDisabled}
        aria-label={marked ? "移除我的標記" : "加入我的標記"}
        aria-pressed={marked}
      >
        <Star aria-hidden="true" />
      </button>
      <div className="material-mobile-list-identity">
        <button type="button" className="material-mobile-list-open" data-testid="material-mobile-row-open" onClick={onOpen} aria-label={`查看料件詳情，虛擬料號${virtualNumber || "未提供"}，實體料號${physicalNumber || "未提供"}`}>
          {showVirtual && <span className="material-mobile-list-number"><span className="material-mobile-list-number-label">虛擬</span><span className={cn("material-mobile-list-number-value", !virtualNumber && "is-empty")} title={virtualNumber || "未提供"}>{virtualNumber || "未提供"}</span></span>}
          {showPhysical && <span className="material-mobile-list-number"><span className="material-mobile-list-number-label">實體</span><span className={cn("material-mobile-list-number-value", !physicalNumber && "is-empty")} title={physicalNumber || "未提供"}>{physicalNumber || "未提供"}</span></span>}
          {!showVirtual && !showPhysical && <span className="material-mobile-list-fallback">料件詳情</span>}
        </button>
        {fields.length > 0 && (
          <div className="material-mobile-list-fields" tabIndex={0} role="group" aria-label="已選料件欄位">
            {fields.map(field => <span key={field.key} className="material-mobile-list-field" title={`${field.label}：${field.value || "未提供"}`}><span className="material-mobile-list-field-label">{field.label}</span> {field.value || "未提供"}</span>)}
          </div>
        )}
      </div>
      <button type="button" className="material-mobile-list-status" data-testid="material-mobile-row-tracking" onClick={onTracking} aria-label={`更新進度：${status}`} title={status}>
        <span aria-hidden="true" className={cn("material-mobile-list-status-dot", statusTone)} />
        <span className="material-mobile-list-status-label">{status}</span>
        <ChevronRight aria-hidden="true" />
      </button>
    </article>
  );
}
