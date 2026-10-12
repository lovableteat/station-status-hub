import { ArrowRight, Bot, Check, ClipboardCheck, FileSpreadsheet, FileText, FolderOpen, Layers, LockKeyhole, MessageSquareText, Package, Server, ShieldCheck, Upload, UsersRound, Wrench } from "lucide-react";
import { PcbWorkspacePreview } from "@/components/pcb-designer/PcbWorkspacePreview";

// These are feature illustrations, never live counters or connection indicators.
export function WorkspacePreview({ workspaceId }: { workspaceId: string }) {
  if (workspaceId === "pcb-designer") return <PcbWorkspacePreview />;

  return (
    <div className={`workspace-preview workspace-preview--${workspaceId}`} data-workspace-preview={workspaceId} aria-hidden="true">
      {workspaceId === "station-status" ? (
        <>
          <div className="workspace-preview-caption"><Wrench /><span>從測試到問題追蹤</span></div>
          <div className="preview-repair-flow">
            {["組裝", "測試", "驗證"].map((step, index) => <div key={step}><span className="preview-step-mark">{index === 0 ? <Check /> : index === 1 ? <Wrench /> : <ClipboardCheck />}</span><span>{step}</span>{index < 2 && <ArrowRight className="preview-flow-arrow" />}</div>)}
          </div>
          <div className="preview-repair-record"><span className="preview-record-line" /><span>站點進度</span><span>工單</span><span>工時</span></div>
        </>
      ) : workspaceId === "file-uploads" ? (
        <>
          <div className="workspace-preview-caption"><FolderOpen /><span>工程檔案庫</span></div>
          <div className="preview-upload-files"><span><FileText />文件</span><span><FileSpreadsheet />試算表</span><span><Layers />圖檔</span></div>
          <div className="preview-upload-destination"><Upload /><span>上傳、分類與共享</span><FolderOpen /></div>
        </>
      ) : workspaceId === "material-requests" ? (
        <>
          <div className="workspace-preview-caption"><Package /><span>主料與替代料一起管理</span></div>
          <div className="preview-bom-tree"><div><Package /><span>主料</span><span className="preview-bom-code">MPN</span></div><div><span className="preview-tree-branch" /><Layers /><span>替代料</span><span className="preview-bom-code">MPN</span></div></div>
          <div className="preview-stage-strip"><span>申請</span><ArrowRight /><span>審查</span><ArrowRight /><span>完成</span></div>
        </>
      ) : workspaceId === "data-center" ? (
        <>
          <div className="workspace-preview-caption"><Server /><span>場景配置與機櫃規劃</span></div>
          <div className="preview-rack-scene">
            <div className="preview-rack-aisle preview-rack-aisle--cold" />
            {[0, 1, 2, 3].map(rack => <div className="preview-rack" key={rack}><Server />{[0, 1, 2, 3].map(slot => <span key={slot}><i /><i /></span>)}</div>)}
            <div className="preview-rack-aisle preview-rack-aisle--hot" />
          </div>
          <div className="preview-scene-legend"><span>冷通道</span><span>熱通道</span><span>設備配置</span></div>
        </>
      ) : workspaceId === "user-management" ? (
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
