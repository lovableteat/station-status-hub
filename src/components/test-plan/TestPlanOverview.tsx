import {
  Archive,
  BarChart3,
  Box,
  ChevronRight,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Presentation,
  RefreshCw,
} from "lucide-react";
import type { CSSProperties, KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { formatTestPlanFileSize } from "./core/files";
import {
  getRecentTestPlanFiles,
  getTestPlanCategorySummary,
} from "./core/overview";
import type {
  TestPlanFileCategory,
  TestPlanFileRecord,
  TestPlanFolder,
  TestPlanSpace,
} from "./types";

interface TestPlanOverviewProps {
  activeFolderLabel: string;
  activeSpace: TestPlanSpace;
  files: readonly TestPlanFileRecord[];
  folders: readonly TestPlanFolder[];
  onSelectFile: (file: TestPlanFileRecord) => void;
}

const CATEGORY_LABELS: Record<TestPlanFileCategory, string> = {
  presentation: "簡報",
  spreadsheet: "試算表",
  document: "文件",
  image: "圖片",
  "3d": "3D CAD",
  pcb: "PCB",
  archive: "壓縮檔",
  other: "其他",
};

function OverviewFileIcon({
  category,
  className,
}: {
  category: TestPlanFileCategory;
  className?: string;
}) {
  const props = { className: cn("h-4 w-4", className) };
  if (category === "presentation") return <Presentation {...props} />;
  if (category === "spreadsheet") return <FileSpreadsheet {...props} />;
  if (category === "document") return <FileText {...props} />;
  if (category === "image") return <FileImage {...props} />;
  if (category === "3d") return <Box {...props} />;
  if (category === "archive") return <FileArchive {...props} />;
  return <File {...props} />;
}

function handleRecentFileKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  file: TestPlanFileRecord,
  onSelectFile: (file: TestPlanFileRecord) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelectFile(file);
  }
}

export function TestPlanOverview({
  activeFolderLabel,
  activeSpace,
  files,
  folders,
  onSelectFile,
}: TestPlanOverviewProps) {
  const categorySummary = getTestPlanCategorySummary(files);
  const recentFiles = getRecentTestPlanFiles(files, 4);
  const totalBytes = files.reduce((sum, file) => sum + file.fileSize, 0);

  return (
    <section className="test-plan-overview" aria-label="工程摘要">
      <article className="test-plan-overview-card test-plan-overview-summary">
        <div className="test-plan-overview-card-heading">
          <div>
            <span className="test-plan-eyebrow">SPACE PULSE</span>
            <h2>空間摘要</h2>
          </div>
          <FolderKanban className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="test-plan-overview-description">
          {activeSpace.description || "尚未設定空間說明"}
        </p>
        <dl className="test-plan-overview-stats">
          <div>
            <dt>工程檔案</dt>
            <dd>{files.length}</dd>
          </div>
          <div>
            <dt>資料夾</dt>
            <dd>{folders.length}</dd>
          </div>
          <div>
            <dt>空間容量</dt>
            <dd>{formatTestPlanFileSize(totalBytes)}</dd>
          </div>
        </dl>
        <div className="test-plan-overview-location">
          <span>目前位置</span>
          <strong>{activeFolderLabel}</strong>
        </div>
        <div className="test-plan-overview-prompt">
          <Archive className="h-4 w-4" aria-hidden="true" />
          <span>
            {files.length === 0
              ? "請從上方上傳工程檔案，建立這個空間的工作索引。"
              : "檔案已集中在這個空間，可從最近更新快速回到工作內容。"}
          </span>
        </div>
      </article>

      <article className="test-plan-overview-card" aria-labelledby="test-plan-composition-title">
        <div className="test-plan-overview-card-heading">
          <div>
            <span className="test-plan-eyebrow">FILE MIX</span>
            <h2 id="test-plan-composition-title">檔案類型分布</h2>
          </div>
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
        </div>
        {files.length === 0 ? (
          <p className="test-plan-overview-muted">此空間尚未上傳工程檔案</p>
        ) : (
          <div className="test-plan-category-list">
            {categorySummary.map((item) => {
              const style = {
                "--category-width": `${item.percentage}%`,
              } as CSSProperties;
              return (
                <div
                  className={cn("test-plan-category-row", `is-${item.category}`)}
                  key={item.category}
                >
                  <div className="test-plan-category-label">
                    <span>{CATEGORY_LABELS[item.category]}</span>
                    <strong>{item.count}</strong>
                  </div>
                  <div
                    className="test-plan-category-track"
                    aria-label={`${CATEGORY_LABELS[item.category]} ${item.count} 個檔案，${item.percentage}%`}
                  >
                    <span style={style} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="test-plan-overview-card" aria-labelledby="test-plan-recent-title">
        <div className="test-plan-overview-card-heading">
          <div>
            <span className="test-plan-eyebrow">RECENT ACTIVITY</span>
            <h2 id="test-plan-recent-title">最近更新</h2>
          </div>
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </div>
        {recentFiles.length === 0 ? (
          <p className="test-plan-overview-muted">
            上傳工程檔案後，這裡會顯示最近更新。
          </p>
        ) : (
          <div className="test-plan-recent-file-list">
            {recentFiles.map((file) => (
              <button
                aria-label={`選取 ${file.originalName}`}
                className="test-plan-recent-file"
                key={file.id}
                onClick={() => onSelectFile(file)}
                onKeyDown={(event) =>
                  handleRecentFileKeyDown(event, file, onSelectFile)}
                type="button"
              >
                <span className={cn("test-plan-recent-file-icon", `is-${file.category}`)}>
                  <OverviewFileIcon category={file.category} />
                </span>
                <span className="test-plan-recent-file-copy">
                  <strong>{file.originalName}</strong>
                  <small>
                    {formatTestPlanFileSize(file.fileSize)} · {new Date(file.updatedAt).toLocaleDateString("zh-TW")}
                  </small>
                </span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
