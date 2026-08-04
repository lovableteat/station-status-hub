import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  Info,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatTestPlanFileSize } from "./core/files";
import {
  getTestPlanPreviewKind,
  type TestPlanPreviewKind,
} from "./core/preview";
import { isEditableSpreadsheet } from "./core/spreadsheet";
import type {
  TestPlanEntry,
  TestPlanFileRecord,
} from "./types";

interface TestPlanInspectorProps {
  busy: boolean;
  canEdit: boolean;
  downloadFile: (file: TestPlanFileRecord) => Promise<Blob>;
  entry: TestPlanEntry | null;
  onDelete: (entry: TestPlanEntry) => void;
  onDescribe: (file: TestPlanFileRecord) => void;
  onDownload: (file: TestPlanFileRecord) => void;
  onEditSpreadsheet: (file: TestPlanFileRecord) => void;
  onMove: (entry: TestPlanEntry) => void;
  onRename: (entry: TestPlanEntry) => void;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未提供";
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PreviewState({
  file,
  downloadFile,
}: {
  file: TestPlanFileRecord;
  downloadFile: (file: TestPlanFileRecord) => Promise<Blob>;
}) {
  const previewKind = useMemo(() => getTestPlanPreviewKind(file), [file]);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    let alive = true;
    let nextObjectUrl: string | null = null;
    setObjectUrl(null);
    setTextPreview("");

    if (previewKind === "unsupported") {
      setStatus("idle");
      return () => undefined;
    }

    setStatus("loading");
    void downloadFile(file)
      .then(async (blob) => {
        if (!alive) return;
        if (previewKind === "text") {
          const text = await blob.text();
          if (!alive) return;
          setTextPreview(text.slice(0, 250_000));
        } else {
          nextObjectUrl = URL.createObjectURL(blob);
          setObjectUrl(nextObjectUrl);
        }
        setStatus("ready");
      })
      .catch(() => {
        if (alive) setStatus("error");
      });

    return () => {
      alive = false;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [downloadFile, file, previewKind]);

  if (previewKind === "unsupported") {
    return (
      <div className="test-plan-preview-empty">
        <Info className="h-7 w-7" />
        <strong>此格式需使用工程軟體開啟</strong>
        <span>可先下載，再使用對應的 Office、CAD 或 PCB 工具檢視。</span>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="test-plan-preview-empty">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>正在載入安全預覽…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="test-plan-preview-empty is-error">
        <Info className="h-6 w-6" />
        <strong>無法載入預覽</strong>
        <span>檔案仍可透過下載開啟。</span>
      </div>
    );
  }

  if (previewKind === "image" && objectUrl) {
    return <img src={objectUrl} alt={`${file.originalName} 預覽`} />;
  }
  if (previewKind === "pdf" && objectUrl) {
    return <iframe src={objectUrl} title={`${file.originalName} PDF 預覽`} />;
  }
  if (previewKind === "text" && status === "ready") {
    return <pre>{textPreview || "檔案沒有文字內容。"}</pre>;
  }
  return null;
}

export function TestPlanInspector({
  busy,
  canEdit,
  downloadFile,
  entry,
  onDelete,
  onDescribe,
  onDownload,
  onEditSpreadsheet,
  onMove,
  onRename,
}: TestPlanInspectorProps) {
  if (!entry) {
    return (
      <aside className="test-plan-inspector" aria-label="項目資訊">
        <div className="test-plan-inspector-empty">
          <Eye className="h-7 w-7" />
          <strong>選取項目以查看資訊</strong>
          <span>單擊檔案即可預覽；資料夾可查看位置與更新時間。</span>
        </div>
      </aside>
    );
  }

  const name = entry.kind === "folder" ? entry.name : entry.originalName;

  return (
    <aside className="test-plan-inspector" aria-label="項目資訊">
      <div className="test-plan-inspector-heading">
        <span className={cn(
          "test-plan-entry-icon",
          entry.kind === "folder" ? "is-folder" : `is-${entry.category}`,
        )}>
          {entry.kind === "folder" ? (
            <Folder className="h-5 w-5" />
          ) : (
            <FileText className="h-5 w-5" />
          )}
        </span>
        <div>
          <strong title={name}>{name}</strong>
          <span>{entry.kind === "folder" ? "資料夾" : `${entry.extension.toUpperCase() || "FILE"} 檔案`}</span>
        </div>
      </div>

      {entry.kind === "file" ? (
        <div className="test-plan-preview">
          <PreviewState file={entry} downloadFile={downloadFile} />
        </div>
      ) : (
        <div className="test-plan-preview-empty">
          <Folder className="h-8 w-8" />
          <strong>資料夾資訊</strong>
          <span>雙擊中央項目即可進入此資料夾。</span>
        </div>
      )}

      <dl className="test-plan-inspector-meta">
        {entry.kind === "file" && (
          <>
            <div><dt>檔案大小</dt><dd>{formatTestPlanFileSize(entry.fileSize)}</dd></div>
            <div><dt>檔案類型</dt><dd>{entry.mimeType || entry.extension.toUpperCase() || "未知"}</dd></div>
          </>
        )}
        <div><dt>更新時間</dt><dd>{formatDate(entry.updatedAt)}</dd></div>
        {entry.kind === "file" && (
          <div><dt>說明</dt><dd>{entry.description || "尚未填寫"}</dd></div>
        )}
      </dl>

      <div className="test-plan-inspector-actions">
        {entry.kind === "file" && isEditableSpreadsheet(entry) && (
          <Button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => onEditSpreadsheet(entry)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            直接編輯 Excel
          </Button>
        )}
        {entry.kind === "file" && (
          <Button
            type="button"
            variant={isEditableSpreadsheet(entry) ? "outline" : "default"}
            onClick={() => onDownload(entry)}
          >
            <Download className="mr-2 h-4 w-4" />
            下載檔案
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!canEdit || busy}
          onClick={() => onRename(entry)}
        >
          <Pencil className="mr-2 h-4 w-4" />
          重新命名
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canEdit || busy}
          onClick={() => onMove(entry)}
        >
          <FolderInput className="mr-2 h-4 w-4" />
          搬移
        </Button>
        {entry.kind === "file" && (
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || busy}
            onClick={() => onDescribe(entry)}
          >
            <FileText className="mr-2 h-4 w-4" />
            編輯說明
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!canEdit || busy}
          className="text-red-300 hover:text-red-200"
          onClick={() => onDelete(entry)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          刪除
        </Button>
      </div>
    </aside>
  );
}
