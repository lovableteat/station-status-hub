import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Download,
  ExternalLink,
  Eye,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Info,
  Loader2,
  Pencil,
  Presentation,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatTestPlanFileSize } from "./core/files";
import {
  getTestPlanPreviewKind,
  TEST_PLAN_PREVIEW_LIMITS,
  type TestPlanPreviewKind,
} from "./core/preview";
import { isEditableSpreadsheet } from "./core/spreadsheet";
import { describeEntryType, formatEntryDate } from "./core/entryDisplay";
import type {
  TestPlanEntry,
  TestPlanFileCategory,
  TestPlanFileRecord,
} from "./types";

export function FileTypeIcon({ entry, className }: { entry: TestPlanEntry; className?: string }) {
  const props = { className: cn("h-4 w-4", className), "aria-hidden": true as const };
  if (entry.kind === "folder") return <Folder {...props} />;
  const category: TestPlanFileCategory = entry.category;
  if (category === "presentation") return <Presentation {...props} />;
  if (category === "spreadsheet") return <FileSpreadsheet {...props} />;
  if (category === "document") return <FileText {...props} />;
  if (category === "image") return <FileImage {...props} />;
  if (category === "3d") return <Box {...props} />;
  if (category === "archive") return <FileArchive {...props} />;
  return <File {...props} />;
}

interface SheetPreview {
  names: string[];
  rows: Record<string, string[][]>;
}

type PreviewData =
  | { status: "loading" }
  | { status: "on-request" }
  | { status: "error" }
  | { status: "too-large" }
  | { status: "unsupported" }
  | { status: "url"; url: string; linked: boolean }
  | { status: "text"; text: string }
  | { status: "sheet"; sheet: SheetPreview }
  | { status: "archive"; names: string[]; total: number };

const RASTER_TYPES: Record<string, string> = {
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
};

function rasterImageType(file: TestPlanFileRecord) {
  const extension = (file.extension || file.originalName.split(".").pop() || "").toLowerCase();
  return RASTER_TYPES[extension] ?? "application/octet-stream";
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function columnName(index: number) {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

const SHEET_PREVIEW_ROWS = 60;
/** Spreadsheets and archives above these sizes wait for a click instead of loading on selection. */
const AUTO_PREVIEW_LIMIT: Partial<Record<TestPlanPreviewKind, number>> = {
  sheet: 8 * 1024 * 1024,
  archive: 20 * 1024 * 1024,
};
const PREVIEW_DELAY_MS = 200;
const SHEET_PREVIEW_COLUMNS = 18;

async function readSheetPreview(blob: Blob): Promise<SheetPreview> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array", sheetRows: SHEET_PREVIEW_ROWS, cellDates: true });
  const rows: Record<string, string[][]> = {};
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const values = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true }) : [];
    rows[name] = values.slice(0, SHEET_PREVIEW_ROWS).map((row) => row.slice(0, SHEET_PREVIEW_COLUMNS).map((cell) => String(cell ?? "")));
  }
  return { names: workbook.SheetNames, rows };
}

// zh-TW Windows writes ZIP names in Big5 without the UTF-8 flag; names with the flag stay UTF-8.
function decodeZipName(bytes: string[] | Uint8Array | Buffer) {
  if (typeof bytes === "string") return bytes;
  const data = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes as unknown as ArrayLike<number>);
  try {
    return new TextDecoder("big5", { fatal: true }).decode(data);
  } catch {
    return new TextDecoder("utf-8").decode(data);
  }
}

async function readArchivePreview(blob: Blob) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(blob, { decodeFileName: decodeZipName });
  const names: string[] = [];
  zip.forEach((path, entry) => { if (!entry.dir) names.push(path); });
  return { names: names.slice(0, 300), total: names.length };
}

function PreviewState({
  file,
  kind,
  downloadFile,
  getPreviewUrl,
  onLinkReady,
}: {
  file: TestPlanFileRecord;
  kind: TestPlanPreviewKind;
  downloadFile: (file: TestPlanFileRecord) => Promise<Blob>;
  getPreviewUrl?: (file: TestPlanFileRecord) => Promise<string | null>;
  onLinkReady: (url: string | null) => void;
}) {
  const [data, setData] = useState<PreviewData>({ status: "loading" });
  const [sheetName, setSheetName] = useState("");
  const [requested, setRequested] = useState(false);
  // The list hands over a fresh copy of the record on every sort or refresh; only a real change reloads.
  const fileRef = useRef(file);
  fileRef.current = file;
  const autoLimit = AUTO_PREVIEW_LIMIT[kind];
  const waitForClick = autoLimit !== undefined && file.fileSize > autoLimit && !requested;

  useEffect(() => setRequested(false), [file.id]);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    const file = fileRef.current;
    setData({ status: "loading" });
    setSheetName("");
    onLinkReady(null);
    if (kind === "unsupported") {
      setData({ status: "unsupported" });
      return () => undefined;
    }
    if (waitForClick) {
      setData({ status: "on-request" });
      return () => undefined;
    }
    const limit = TEST_PLAN_PREVIEW_LIMITS[kind];
    // Holding an arrow key flips through many files; only the one the user stops on is fetched.
    const timer = window.setTimeout(() => void (async () => {
      try {
        // Raster images and PDFs stream from a short-lived storage link, so a large
        // drawing shows without first downloading the whole file into the page.
        if ((kind === "image" || (kind === "pdf" && file.fileSize > 20 * 1024 * 1024)) && getPreviewUrl) {
          const url = await getPreviewUrl(file).catch(() => null);
          if (!alive) return;
          if (url) {
            onLinkReady(url);
            setData({ status: "url", url, linked: true });
            return;
          }
        }
        if (file.fileSize > limit) {
          setData({ status: "too-large" });
          return;
        }
        // Fetch through the short-lived link when there is one, so leaving the file cancels the transfer.
        const link = getPreviewUrl ? await getPreviewUrl(file).catch(() => null) : null;
        if (!alive) return;
        const blob = link
          ? await fetch(link, { signal: controller.signal }).then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.blob(); })
          : await downloadFile(file);
        if (!alive) return;
        if (kind === "text") {
          const text = await blob.text();
          if (alive) setData({ status: "text", text: text.slice(0, 250_000) });
        } else if (kind === "svg") {
          // A data: URL inside <img> never runs the drawing's scripts and cannot be opened as a page.
          const url = await readAsDataUrl(new Blob([blob], { type: "image/svg+xml" }));
          if (alive) setData({ status: "url", url, linked: false });
        } else if (kind === "sheet") {
          const sheet = await readSheetPreview(blob);
          if (alive) setData({ status: "sheet", sheet });
        } else if (kind === "archive") {
          const archive = await readArchivePreview(blob);
          if (alive) setData({ status: "archive", ...archive });
        } else {
          // The type comes from the file name, never from the stored object: a blob: URL has this
          // site's origin, and an SVG or HTML body labelled as a PDF must not run as a page here.
          const typed = new Blob([blob], { type: kind === "pdf" ? "application/pdf" : rasterImageType(file) });
          objectUrl = URL.createObjectURL(typed);
          setData({ status: "url", url: objectUrl, linked: false });
        }
      } catch {
        if (alive) setData({ status: "error" });
      }
    })(), PREVIEW_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [downloadFile, file.id, file.updatedAt, file.fileSize, getPreviewUrl, kind, onLinkReady, waitForClick]);

  if (data.status === "loading") {
    return (
      <div className="test-plan-preview-empty" role="status">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>正在載入預覽…</span>
      </div>
    );
  }
  if (data.status === "on-request") {
    return (
      <div className="test-plan-preview-empty">
        <Info className="h-7 w-7" />
        <strong>{kind === "sheet" ? "試算表較大" : "壓縮檔較大"}（{formatTestPlanFileSize(file.fileSize)}）</strong>
        <span>為了不拖慢清單，按下面的按鈕再載入預覽。</span>
        <Button type="button" size="sm" variant="outline" onClick={() => setRequested(true)}>載入預覽</Button>
      </div>
    );
  }
  if (data.status === "unsupported") {
    return (
      <div className="test-plan-preview-empty">
        <Info className="h-7 w-7" />
        <strong>此格式需使用工程軟體開啟</strong>
        <span>按「下載」後，用對應的 Office、CAD 或 PCB 工具開啟。</span>
      </div>
    );
  }
  if (data.status === "too-large") {
    return (
      <div className="test-plan-preview-empty">
        <Info className="h-7 w-7" />
        <strong>檔案較大，預覽會拖慢瀏覽器</strong>
        <span>{formatTestPlanFileSize(file.fileSize)}，請按「下載」後開啟。</span>
      </div>
    );
  }
  if (data.status === "error") {
    return (
      <div className="test-plan-preview-empty is-error">
        <Info className="h-6 w-6" />
        <strong>無法載入預覽</strong>
        <span>檔案仍可透過下載開啟。</span>
      </div>
    );
  }
  if (data.status === "text") {
    return <pre className="file-preview-text">{data.text || "檔案沒有文字內容。"}</pre>;
  }
  if (data.status === "archive") {
    return (
      <div className="file-preview-archive">
        <p>壓縮檔內有 {data.total.toLocaleString()} 個檔案{data.total > data.names.length ? `，顯示前 ${data.names.length} 個` : ""}</p>
        <ul>{data.names.map((name) => <li key={name} title={name}><File className="h-3.5 w-3.5" aria-hidden="true" />{name}</li>)}</ul>
      </div>
    );
  }
  if (data.status === "sheet") {
    const active = sheetName && data.sheet.rows[sheetName] ? sheetName : data.sheet.names[0] ?? "";
    const rows = data.sheet.rows[active] ?? [];
    const columns = Math.max(1, ...rows.map((row) => row.length));
    return (
      <div className="file-preview-sheet">
        <div className="file-preview-sheet-grid">
          <table>
            <thead>
              <tr>
                <th aria-hidden="true" />
                {Array.from({ length: columns }, (_, index) => <th key={index}>{columnName(index)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th>{rowIndex + 1}</th>
                  {Array.from({ length: columns }, (_, index) => <td key={index} title={row[index] || undefined}>{row[index]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="file-preview-sheet-tabs" role="tablist" aria-label="工作表">
          {data.sheet.names.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={name === active} className={cn(name === active && "is-active")} onClick={() => setSheetName(name)}>{name}</button>
          ))}
          <span>預覽前 {SHEET_PREVIEW_ROWS} 列</span>
        </div>
      </div>
    );
  }
  if (kind === "pdf") {
    return <iframe src={data.url} title={`${file.originalName} PDF 預覽`} />;
  }
  return (
    <div className="file-preview-image">
      <img src={data.url} alt={`${file.originalName} 預覽`} referrerPolicy="no-referrer" />
    </div>
  );
}

interface TestPlanInspectorProps {
  busy: boolean;
  canEdit: boolean;
  downloadFile: (file: TestPlanFileRecord) => Promise<Blob>;
  /** Inline (not attachment) storage link for streaming previews; null when the storage has none. */
  getPreviewUrl?: (file: TestPlanFileRecord) => Promise<string | null>;
  /** The focused item, or null. */
  entry: TestPlanEntry | null;
  /** Every selected item (the preview shows a summary when there are several). */
  selectedEntries: readonly TestPlanEntry[];
  ownerName: (spaceId: string) => string;
  locationLabel: (entry: TestPlanEntry) => string;
  folderCounts: (folderId: string) => { folders: number; files: number };
  onDescribe: (file: TestPlanFileRecord) => void;
  onDownload: (file: TestPlanFileRecord) => void;
  onEditSpreadsheet: (file: TestPlanFileRecord) => void;
  onOpenFolder: (entry: TestPlanEntry) => void;
  onClose?: () => void;
}

export function TestPlanInspector({
  busy,
  canEdit,
  downloadFile,
  getPreviewUrl,
  entry,
  selectedEntries,
  ownerName,
  locationLabel,
  folderCounts,
  onDescribe,
  onDownload,
  onEditSpreadsheet,
  onOpenFolder,
  onClose,
}: TestPlanInspectorProps) {
  const previewKind = useMemo(() => (entry?.kind === "file" ? getTestPlanPreviewKind(entry) : "unsupported"), [entry]);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const closeButton = onClose && (
    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0" aria-label="關閉預覽窗格" title="關閉預覽窗格（Alt+P）"><X /></Button>
  );

  if (selectedEntries.length > 1) {
    const files = selectedEntries.filter((item): item is Extract<TestPlanEntry, { kind: "file" }> => item.kind === "file");
    const total = files.reduce((sum, file) => sum + file.fileSize, 0);
    return (
      <aside className="test-plan-inspector" aria-label="預覽窗格" data-preview-kind="multi">
        <div className="test-plan-inspector-heading">
          <span className="test-plan-inspector-icon"><Eye className="h-4 w-4" /></span>
          <div><strong>已選取 {selectedEntries.length} 個項目</strong><span>{files.length} 個檔案 · 總計 {formatTestPlanFileSize(total)}</span></div>
          {closeButton}
        </div>
        <ul className="file-preview-multi">
          {selectedEntries.slice(0, 40).map((item) => (
            <li key={`${item.kind}:${item.id}`} className={cn("file-type", item.kind === "folder" ? "is-folder" : `is-${item.category}`)}>
              <FileTypeIcon entry={item} />
              <span title={item.kind === "folder" ? item.name : item.originalName}>{item.kind === "folder" ? item.name : item.originalName}</span>
              <small>{item.kind === "file" ? formatTestPlanFileSize(item.fileSize) : "資料夾"}</small>
            </li>
          ))}
        </ul>
        {selectedEntries.length > 40 && <p className="file-preview-more">還有 {selectedEntries.length - 40} 個項目</p>}
      </aside>
    );
  }

  if (!entry) {
    return (
      <aside className="test-plan-inspector" aria-label="預覽窗格" data-preview-kind="empty">
        <div className="test-plan-inspector-heading is-quiet">
          <span className="test-plan-inspector-icon"><Eye className="h-4 w-4" /></span>
          <div><strong>預覽窗格</strong><span>Alt+P 開關</span></div>
          {closeButton}
        </div>
        <div className="test-plan-inspector-empty">
          <Eye className="h-7 w-7" />
          <strong>選取檔案就能直接看到內容</strong>
          <span>PDF、圖片、SVG、Excel、文字檔與 ZIP 清單都能在這裡預覽；用 ↑ ↓ 逐一切換。</span>
        </div>
      </aside>
    );
  }

  const name = entry.kind === "folder" ? entry.name : entry.originalName;
  const spreadsheet = entry.kind === "file" && isEditableSpreadsheet(entry);
  const counts = entry.kind === "folder" ? folderCounts(entry.id) : null;

  return (
    <aside className="test-plan-inspector" aria-label="預覽窗格" data-preview-kind={entry.kind === "folder" ? "folder" : previewKind}>
      <div className="test-plan-inspector-heading">
        <span className={cn("test-plan-inspector-icon file-type", entry.kind === "folder" ? "is-folder" : `is-${entry.category}`)}>
          <FileTypeIcon entry={entry} />
        </span>
        <div>
          <strong title={name}>{name}</strong>
          <span>{describeEntryType(entry)}</span>
        </div>
        {entry.kind === "file" ? (
          <>
            <Button type="button" size="sm" className="file-preview-primary" onClick={() => onDownload(entry)} title="下載（也可以直接把檔案拖到桌面）">
              <Download className="mr-1.5 h-4 w-4" />下載
            </Button>
            {spreadsheet && (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onEditSpreadsheet(entry)}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />{canEdit ? "直接編輯 Excel" : "開啟 Excel"}
              </Button>
            )}
            {!spreadsheet && linkUrl && (
              <Button type="button" size="sm" variant="outline" onClick={() => window.open(linkUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="mr-1.5 h-4 w-4" />新分頁開啟
              </Button>
            )}
          </>
        ) : (
          <Button type="button" size="sm" className="file-preview-primary" onClick={() => onOpenFolder(entry)}>
            <Folder className="mr-1.5 h-4 w-4" />開啟
          </Button>
        )}
        {closeButton}
      </div>

      <div className={cn("test-plan-preview", entry.kind === "file" && `is-${previewKind}`)}>
        {entry.kind === "file" ? (
          <PreviewState file={entry} kind={previewKind} downloadFile={downloadFile} getPreviewUrl={getPreviewUrl} onLinkReady={setLinkUrl} />
        ) : (
          <div className="test-plan-preview-empty">
            <Folder className="h-9 w-9" />
            <strong>{counts?.folders ?? 0} 個子資料夾 · {counts?.files ?? 0} 個檔案</strong>
            <span>按兩下或按 Enter 開啟這個資料夾。</span>
          </div>
        )}
      </div>

      <dl className="test-plan-inspector-meta">
        <div><dt>類型</dt><dd>{describeEntryType(entry)}</dd></div>
        {entry.kind === "file" && <div><dt>大小</dt><dd className="is-number">{formatTestPlanFileSize(entry.fileSize)}</dd></div>}
        <div><dt>擁有者</dt><dd>{ownerName(entry.spaceId)}</dd></div>
        <div><dt>修改日期</dt><dd className="is-number">{formatEntryDate(entry.updatedAt)}</dd></div>
        <div className="is-wide"><dt>位置</dt><dd title={locationLabel(entry)}>{locationLabel(entry)}</dd></div>
        {entry.kind === "file" && (
          <div className="is-wide">
            <dt>說明</dt>
            <dd className="file-preview-description">
              <span>{entry.description || "尚未填寫"}</span>
              {canEdit && (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onDescribe(entry)} aria-label="編輯說明" title="編輯說明">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
