import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Download, FileText, ImagePlus, Maximize2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CircuitImageMarks } from "./CircuitImageMarks";
import { CIRCUIT_IMAGE_SIDE_LABELS, type CircuitImage, type CircuitImageSide, type CircuitUploadFailure } from "./types";

const sides = Object.keys(CIRCUIT_IMAGE_SIDE_LABELS) as CircuitImageSide[];
export type CircuitImageUrls = Record<string, { original: string; thumbnail: string }>;
const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

interface PaneActions {
  onSide: (side: CircuitImageSide) => void; onDragSide: (side: CircuitImageSide | null) => void;
  onPick: (side: CircuitImageSide) => void; onFiles: (files: File[], side: CircuitImageSide) => void;
  onOpen: (image: CircuitImage) => void; onRemove: (image: CircuitImage) => void; onDownload: (image: CircuitImage) => void;
  /** Shows the PDF page a framed picture came from. */
  onShowSource?: (image: CircuitImage) => void;
}

/**
 * 修改前 and 修改後 sit side by side with one picture shown large in each; 補充圖 is a row of thumbnails below.
 * The pane that was last clicked receives pasted screenshots, and a file dropped on a pane goes to that pane.
 */
export function CircuitChangeImages({ view = "all", heading, hint, images, urls, side, dragSide, readOnly, busy, uploading, progress, warnings, failures, removed, onRestore, onRetry, onDismiss, ...actions }: PaneActions & {
  /** "all": the three boxes together. One side: only that box, shown inside its step of the form. "status": upload messages only. */
  view?: "all" | "status" | CircuitImageSide; heading?: string; hint?: string;
  images: CircuitImage[]; urls: CircuitImageUrls; side: CircuitImageSide; dragSide: CircuitImageSide | null;
  readOnly: boolean; busy: boolean; uploading: boolean; progress: { completed: number; total: number };
  warnings: string[]; failures: CircuitUploadFailure[]; removed: CircuitImage | null;
  onRestore: () => void; onRetry: () => void; onDismiss: () => void;
}) {
  const retryable = failures.some(failure => !failure.permanent);
  const status = <>
    {uploading && <p className="circuit-upload-progress" role="status">正在上傳 {progress.completed} / {progress.total} 張，已成功的圖片會保留</p>}
    {removed && !readOnly && <p className="circuit-upload-undo" role="status"><span>已刪除 {removed.name}</span><Button data-circuit-tone="done" title="把剛刪除的圖片放回來" type="button" variant="outline" onClick={onRestore}>還原</Button></p>}
    {warnings.length > 0 && <div className="circuit-upload-warning" role="status">{warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
    {failures.length > 0 && <div className="circuit-upload-failures" role="alert">
      <p>以下檔案沒有加入，已成功的圖片保留：</p>
      <ul>{failures.map((failure, index) => <li key={index}>{failure.file.name}：{failure.error}</li>)}</ul>
      <div>
        {retryable && <Button data-circuit-tone="add" title="重新上傳失敗的圖片" type="button" variant="outline" disabled={busy || readOnly} onClick={onRetry}>重試失敗圖片</Button>}
        <Button title="關閉這則訊息" type="button" variant="ghost" onClick={onDismiss}>{retryable ? "不重試" : "知道了"}</Button>
      </div>
    </div>}
  </>;
  if (view === "status") return uploading || (removed && !readOnly) || warnings.length || failures.length ? <div className="circuit-image-status">{status}</div> : null;
  if (view !== "all") return <section className="circuit-image-section" data-view={view} aria-label={heading || `${CIRCUIT_IMAGE_SIDE_LABELS[view]}圖片`}>
    <div className="circuit-image-columns" data-mobile-side={view} data-only={view}>
      <Pane side={view} images={images.filter(image => image.side === view)} urls={urls} active={side === view} dropping={dragSide === view} readOnly={readOnly} busy={busy} heading={heading} hint={hint} {...actions} />
    </div>
  </section>;
  return <section className="circuit-image-section" aria-label="修改前後圖片">
    <header className="circuit-image-heading">
      <h3>修改前後對照</h3>
      <span>{images.length} 張</span>
      <p className="circuit-upload-hint" title={readOnly ? undefined : "截圖後按 Ctrl+V 貼上，或把圖片拖到要放的那一格；每項最多 200 張、每張 50 MB，不需壓縮。"}>{readOnly ? "點圖片可放大查看標記，也可下載原圖。" : <><span className="circuit-wide-copy">每項最多 200 張、每張 50 MB</span><span className="circuit-compact-copy">選「修改前」或「修改後」，再點下方區塊選取圖片。每項最多 200 張、每張 50 MB，不需壓縮。</span></>}</p>
    </header>
    <div className="circuit-image-controls">
      <div role="group" aria-label="圖片用途">
        {sides.map(key => <button title={`切換到${CIRCUIT_IMAGE_SIDE_LABELS[key]}`} type="button" key={key} aria-pressed={side === key} onClick={() => actions.onSide(key)}>{CIRCUIT_IMAGE_SIDE_LABELS[key]} <span>{images.filter(image => image.side === key).length}</span></button>)}
      </div>
    </div>
    {uploading && <p className="circuit-upload-progress" role="status">正在上傳 {progress.completed} / {progress.total} 張，已成功的圖片會保留</p>}
    {removed && !readOnly && <p className="circuit-upload-undo" role="status"><span>已刪除 {removed.name}</span><Button data-circuit-tone="done" title="把剛刪除的圖片放回來" type="button" variant="outline" onClick={onRestore}>還原</Button></p>}
    {warnings.length > 0 && <div className="circuit-upload-warning" role="status">{warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
    {failures.length > 0 && <div className="circuit-upload-failures" role="alert">
      <p>以下檔案沒有加入，已成功的圖片保留：</p>
      <ul>{failures.map((failure, index) => <li key={index}>{failure.file.name}：{failure.error}</li>)}</ul>
      <div>
        {retryable && <Button data-circuit-tone="add" title="重新上傳失敗的圖片" type="button" variant="outline" disabled={busy || readOnly} onClick={onRetry}>重試失敗圖片</Button>}
        <Button title="關閉這則訊息" type="button" variant="ghost" onClick={onDismiss}>{retryable ? "不重試" : "知道了"}</Button>
      </div>
    </div>}
    <div className="circuit-image-columns" data-mobile-side={side}>
      {sides.map(key => <Pane key={key} side={key} images={images.filter(image => image.side === key)} urls={urls} active={side === key} dropping={dragSide === key} readOnly={readOnly} busy={busy} {...actions} />)}
    </div>
  </section>;
}

function Pane({ side, images, urls, active, dropping, readOnly, busy, heading, hint, onSide, onDragSide, onPick, onFiles, onOpen, onRemove, onDownload, onShowSource }: PaneActions & {
  side: CircuitImageSide; images: CircuitImage[]; urls: CircuitImageUrls; active: boolean; dropping: boolean; readOnly: boolean; busy: boolean;
  /** Inside a form step the box has one plain name (問題截圖 / 改好後截圖) instead of 修改前 + a second caption. */
  heading?: string; hint?: string;
}) {
  const label = CIRCUIT_IMAGE_SIDE_LABELS[side], compact = side === "reference";
  const addName = `加入${label}`;
  const [shownId, setShownId] = useState("");
  const known = useRef<string[] | null>(null);
  const ids = images.map(image => image.id).join("|");
  // A picture that has just been added is the one to look at.
  useEffect(() => {
    const next = ids ? ids.split("|") : [];
    const added = known.current ? next.filter(id => !known.current!.includes(id)) : [];
    if (added.length) setShownId(added[added.length - 1]);
    known.current = next;
  }, [ids]);
  const shownIndex = Math.max(0, images.findIndex(image => image.id === shownId));
  const shown = images[shownIndex];
  const frame = (image: CircuitImage) => ({ "--circuit-image-aspect": image.width / image.height, aspectRatio: `${image.width} / ${image.height}` }) as CSSProperties;
  const actions = (image: CircuitImage) => <div className="circuit-image-actions">
    {image.source && onShowSource && <Button data-circuit-tone="view" data-fill="ghost" type="button" variant="ghost" className="circuit-image-source" aria-label={`到 PDF 第 ${image.source.page} 頁（${image.source.date}）`} title={`在 PDF 圖面打開 ${image.source.date} 版第 ${image.source.page} 頁`} onClick={() => onShowSource(image)}><FileText aria-hidden="true" /><span>第 {image.source.page} 頁</span></Button>}
    <Button type="button" variant="ghost" aria-label={`下載原圖 ${image.name}`} title="下載原圖" onClick={() => onDownload(image)}><Download aria-hidden="true" /></Button>
    {!readOnly && <Button data-circuit-tone="delete" data-fill="ghost" type="button" variant="ghost" aria-label={`刪除圖片 ${image.name}`} title="刪除這張圖（可以還原）" disabled={busy} onClick={() => onRemove(image)}><Trash2 aria-hidden="true" /></Button>}
  </div>;
  const empty = <button title={`${addName}：點這裡選檔，也可以貼上（Ctrl+V）或拖進來`} type="button" className="circuit-image-empty" aria-label={addName} disabled={readOnly || busy} onFocus={() => onSide(side)} onClick={() => onPick(side)}>
    <ImagePlus aria-hidden="true" />
    {readOnly ? <span>未提供圖片</span> : <>
      <span className="circuit-wide-copy">{hint || (compact ? "補充圖：規格書、量測波形等，貼上或點這裡選取" : "貼上（Ctrl+V）、拖入或點這裡選取")}</span>
      <span className="circuit-compact-copy">{compact ? "點這裡加入補充圖：規格書截圖、量測波形等" : `點這裡選取${label}`}</span>
    </>}
  </button>;
  return <section className="circuit-image-column" data-side={side} data-active={!readOnly && active} data-dropping={dropping} data-image-count={images.length}
    onPointerDown={() => { if (!readOnly) onSide(side); }}
    onDragOver={event => { if (readOnly || !carriesFiles(event)) return; event.preventDefault(); event.stopPropagation(); onDragSide(side); }}
    onDrop={event => { if (readOnly || !carriesFiles(event)) return; event.preventDefault(); event.stopPropagation(); onDragSide(null); onFiles(Array.from(event.dataTransfer.files), side); }}>
    <header>
      <h4 title={side === "before" ? "哪裡有問題的截圖：在圖面上截圖，或貼上、拖入" : side === "after" ? "改好後的截圖：畫線路的人改完後加入" : "規格書、量測波形等參考資料"}>{heading || label}{!heading && <small className="circuit-image-purpose">{side === "before" ? "問題截圖" : side === "after" ? "改好後" : "參考資料"}</small>}</h4>
      {(!heading || images.length > 0) && <span className="circuit-image-count">{images.length} 張</span>}
      {!readOnly && active && <span className="circuit-paste-target">{dropping ? "放開以加入這裡" : "貼上會加到這裡"}</span>}
      {!readOnly && images.length > 0 && <Button data-circuit-tone="add" title={`再加一張${label}`} type="button" variant="outline" aria-label={addName} disabled={busy} onFocus={() => onSide(side)} onClick={() => onPick(side)}><Upload aria-hidden="true" />加入圖片</Button>}
    </header>
    {compact
      ? images.length > 0 ? <div className="circuit-image-grid">{images.map(image => <figure key={image.id}>
        <button title="放大查看，可以加位置標記或框選" type="button" className="circuit-image-preview" aria-label={`放大圖片 ${image.name}`} onClick={() => onOpen(image)}>
          {urls[image.id] ? <img src={urls[image.id].thumbnail} alt={image.caption || image.name} loading="lazy" /> : <span>載入圖片…</span>}
          {image.marks.length > 0 && <span className="circuit-mark-count">{image.marks.length} 個標記</span>}
        </button>
        <figcaption title={image.caption || image.name}>{image.caption || image.name}</figcaption>
        {actions(image)}
      </figure>)}</div> : empty
      : shown ? <>
        <button type="button" className="circuit-image-stage" aria-label={`放大圖片 ${shown.name}`} title="放大查看、加上位置標記" onClick={() => onOpen(shown)}>
          {urls[shown.id]
            ? <span className="circuit-image-frame" style={frame(shown)}><img src={urls[shown.id].thumbnail} alt={shown.caption || shown.name} /><CircuitImageMarks marks={shown.marks} /></span>
            : <span className="circuit-image-loading">載入圖片…</span>}
          <span className="circuit-image-zoom"><Maximize2 aria-hidden="true" />{readOnly ? "放大" : "放大／標記"}</span>
        </button>
        <div className="circuit-image-meta">
          <span title={shown.caption || shown.name}>{shown.caption || shown.name}</span>
          {shown.marks.length > 0 && <span className="circuit-mark-count">{shown.marks.length} 個標記</span>}
          {images.length > 1 && <span className="circuit-image-position">{shownIndex + 1} / {images.length}</span>}
          {actions(shown)}
        </div>
        {images.length > 1 && <div className="circuit-image-strip" role="group" aria-label={`${label}的所有圖片`}>
          {images.map(image => <button title={`顯示 ${image.name}`} type="button" key={image.id} className="circuit-image-preview" aria-label={`顯示圖片 ${image.name}`} aria-pressed={image.id === shown.id} onClick={() => setShownId(image.id)}>
            {urls[image.id] ? <img src={urls[image.id].thumbnail} alt="" loading="lazy" /> : <span>…</span>}
          </button>)}
        </div>}
      </> : empty}
  </section>;
}
