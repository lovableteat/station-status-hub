import { ArrowRight, Bot, Check, ClipboardCheck, FileSpreadsheet, FileText, Layers, LockKeyhole, MessageSquareText, ShieldCheck, UsersRound } from "lucide-react";
import { PcbWorkspacePreview } from "@/components/pcb-designer/PcbWorkspacePreview";
import repairArtwork from "@/assets/workspace/repair.webp";
import filesArtwork from "@/assets/workspace/files.webp";
import partsArtwork from "@/assets/workspace/parts.webp";
import racksArtwork from "@/assets/workspace/racks.webp";

const workspaceArtwork: Record<string, { image: string; title: string; caption: string }> = {
  "station-status": { image: repairArtwork, title: "機台測試", caption: "組裝 · 測試 · 驗證" },
  "file-uploads": { image: filesArtwork, title: "工程檔案庫", caption: "文件 · 試算表 · 圖檔" },
  "material-requests": { image: partsArtwork, title: "料件與替代料", caption: "BOM 協作" },
  "data-center": { image: racksArtwork, title: "機櫃配置", caption: "3D 場景規劃" },
};

// These are feature illustrations, never live counters or connection indicators.
export function WorkspacePreview({ workspaceId }: { workspaceId: string }) {
  if (workspaceId === "pcb-designer") return <PcbWorkspacePreview />;

  const artwork = workspaceArtwork[workspaceId];
  if (artwork) {
    return (
      <div className={`workspace-preview workspace-preview--${workspaceId} workspace-preview--artwork`} data-workspace-preview={workspaceId} aria-hidden="true">
        <div className="workspace-artwork-copy">
          <strong>{artwork.title}</strong>
          <span>{artwork.caption}</span>
        </div>
        <img className="workspace-artwork-image" src={artwork.image} alt="" width={768} height={512} loading="lazy" decoding="async" draggable={false} />
      </div>
    );
  }

  return (
    <div className={`workspace-preview workspace-preview--${workspaceId}`} data-workspace-preview={workspaceId} aria-hidden="true">
      {workspaceId === "user-management" ? (
        <>
          <div className="workspace-preview-caption"><ShieldCheck /><span>帳號與工作區權限</span></div>
          <div className="preview-access"><span className="preview-access-users"><UsersRound /><LockKeyhole /></span><div>{["檢視", "編輯", "管理"].map((label, index) => <div key={label}><span>{label}</span>{[0, 1, 2].map(level => <span key={level} className={level <= index ? "preview-access-grant" : "preview-access-empty"}>{level <= index ? <Check /> : "—"}</span>)}</div>)}</div></div>
        </>
      ) : workspaceId === "ai-chat" ? (
        <>
          <div className="workspace-preview-caption"><Bot /><span>文件分析與資料查詢</span></div>
          <div className="preview-ai-sources"><span><FileText />PDF</span><span><FileSpreadsheet />Office</span><span><Layers />圖片</span></div>
          <div className="preview-ai-answer"><MessageSquareText /><div><span>查詢 · 比較 · 摘要</span><i /><i /></div></div>
        </>
      ) : workspaceId === "performance" ? (
        <>
          <div className="workspace-preview-caption"><ClipboardCheck /><span>自評、評核與完整彙整</span></div>
          <div className="preview-performance-categories">{["IDP", "OKR", "KPI"].map(category => <div key={category} className={`preview-performance-${category.toLowerCase()}`}><span>{category}</span><i /><i /></div>)}</div>
          <div className="preview-performance-feedback"><MessageSquareText /><span>主管回饋</span><ArrowRight /><span>評分與匯出</span></div>
        </>
      ) : null}
    </div>
  );
}
