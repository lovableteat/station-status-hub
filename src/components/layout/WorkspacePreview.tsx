import { Check, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import repairArtwork from "@/assets/workspace/repair.webp";
import filesArtwork from "@/assets/workspace/files.webp";
import partsArtwork from "@/assets/workspace/parts.webp";
import racksArtwork from "@/assets/workspace/racks.webp";
import pcbArtwork from "@/assets/workspace/pcb.webp";
import analysisArtwork from "@/assets/workspace/analysis.webp";
import performanceArtwork from "@/assets/workspace/performance.webp";
import comparisonArtwork from "@/assets/workspace/comparison.webp";

const workspaceArtwork: Record<string, { image: string; title: string; caption: string }> = {
  "station-status": { image: repairArtwork, title: "機台測試", caption: "組裝 · 測試 · 驗證" },
  "file-uploads": { image: filesArtwork, title: "工程檔案庫", caption: "文件 · 試算表 · 圖檔" },
  "material-requests": { image: partsArtwork, title: "料件與替代料", caption: "BOM 協作" },
  "data-center": { image: racksArtwork, title: "機櫃配置", caption: "3D 場景規劃" },
  "pcb-designer": { image: pcbArtwork, title: "板形、元件與走線", caption: "2D / 3D 電路設計" },
  "ai-chat": { image: analysisArtwork, title: "文件分析與資料查詢", caption: "PDF · Office · 圖片" },
  performance: { image: performanceArtwork, title: "目標與評核", caption: "IDP · OKR · KPI" },
  comparison: { image: comparisonArtwork, title: "A／B 版工程比對", caption: "AutoCheck · 審查追蹤" },
};

// These are feature illustrations, never live counters or connection indicators.
export function WorkspacePreview({ workspaceId }: { workspaceId: string }) {
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
      ) : null}
    </div>
  );
}
