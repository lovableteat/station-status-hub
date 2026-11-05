import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ComparisonPdfViewer } from "./ComparisonPdfViewer";
import { ArrowRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Save, SlidersHorizontal } from "lucide-react";
import { DISPOSITIONS, EMPTY_REPLY, pdfTarget, type PdfLocation, type ReplyPatch, type ReplyPatches } from "./reviewTools";
import type { Artifact, ComparisonSession, ReviewReply, TrackRow } from "./types";

export function ReviewReplyFields({ value, onChange, disabled, prefix }: { value: ReviewReply; onChange: (field: keyof ReplyPatch, value: string) => void; disabled: boolean; prefix: string }) {
  return <div className="comparison-review-fields-inline">
    <label>處置<select aria-label="處置" value={value.disp} disabled={disabled} onChange={event => onChange("disp", event.target.value)}><option value="">未填</option>{[...new Set([...DISPOSITIONS, value.disp].filter(Boolean))].map(item => <option key={item}>{item}</option>)}</select></label>
    <label>負責人<Input id={`${prefix}-owner`} value={value.owner} maxLength={120} disabled={disabled} onChange={event => onChange("owner", event.target.value)} /></label>
    <label>預計版次<Input id={`${prefix}-target`} value={value.target_rev} maxLength={120} disabled={disabled} onChange={event => onChange("target_rev", event.target.value)} /></label>
    <label className="comparison-review-note">備註<Textarea id={`${prefix}-note`} value={value.note} maxLength={10000} disabled={disabled} onChange={event => onChange("note", event.target.value)} /></label>
  </div>;
}

function PdfFrame({ row, url, label, location, zoom, height, side, artifact }: { row: TrackRow; url?: string; label: string; location?: PdfLocation; zoom: number; height: number; side: "a" | "b"; artifact?: Artifact }) {
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  const src = url ? (location?.page === null ? url : pdfTarget(url, row, location, zoom, width, height || 360)) : "";
  return <section className="comparison-pdf-pane" data-side={side} ref={container}>
    <header><b data-side={side}>{side.toUpperCase()}</b><strong title={label}>{label}</strong>{src && <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`另開 ${side.toUpperCase()} 線路圖`} title="另開線路圖"><ExternalLink aria-hidden="true" /><span>另開</span></a>}</header>
    {!artifact || !url ? <p className="comparison-pdf-message">此版本沒有標註線路圖 PDF。</p>
      : <ComparisonPdfViewer artifact={artifact} row={row} location={location} zoom={zoom} height={height} width={width} label={`${side.toUpperCase()} · ${label}`} externalUrl={src} />}
  </section>;
}

export function ComparisonSideBySide({ session, rows, selectedKey, onSelect, locationsA, locationsB, urls, canEdit, busy, onSave, onRemember }: {
  session: ComparisonSession; rows: TrackRow[]; selectedKey: string; onSelect: (key: string) => void;
  locationsA: Map<string, PdfLocation>; locationsB: Map<string, PdfLocation>; urls: { a?: string; b?: string };
  canEdit: boolean; busy: boolean; onSave: (patches: ReplyPatches) => Promise<void>; onRemember: (key: string) => Promise<void>;
}) {
  const row = rows.find(item => item.key === selectedKey) ?? rows[0];
  const [zoom, setZoom] = useState(300);
  const [height, setHeight] = useState(0);
  const [showPdf, setShowPdf] = useState(true);
  const [mobileSide, setMobileSide] = useState<"a" | "b">("b");
  const [drafts, setDrafts] = useState<Record<string, ReplyPatch>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const numbers = useMemo(() => new Map(session.result.rows.map((item, index) => [item.key, index + 1])), [session.result.rows]);
  const index = rows.findIndex(item => item.key === row?.key);
  const draft = row ? { ...EMPTY_REPLY, ...session.replies[row.key], ...drafts[row.key] } : EMPTY_REPLY;
  const jump = (key: string, status = "") => {
    onSelect(key); setMessage(status);
    if (canEdit) void onRemember(key).catch(error => setMessage(error instanceof Error ? error.message : String(error)));
  };
  const go = (offset: number) => { const next = rows[offset]; if (next) jump(next.key); };
  const save = async (advance = false) => {
    if (!row || saving || busy || !canEdit) return;
    setSaving(true); setMessage("");
    try {
      await onSave({ [row.key]: drafts[row.key] ?? {} });
      setDrafts(current => { const next = { ...current }; delete next[row.key]; return next; });
      if (advance && rows[index + 1]) jump(rows[index + 1].key, `已儲存 #${numbers.get(row.key)}`);
      else setMessage("回覆已儲存");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  if (!row) return <p className="comparison-empty-result">目前篩選條件沒有符合的比對結果</p>;
  const children = session.result.rows.filter(item => row.children?.includes(item.key));
  return <div className="comparison-review-side" data-has-pdf={showPdf}>
    <div className="comparison-review-navigation">
      <div className="comparison-review-stepper">
        <Button variant="ghost" size="icon" aria-label="第一筆審查" title="第一筆" disabled={index <= 0 || saving} onClick={() => go(0)}><ChevronsLeft /></Button>
        <Button variant="ghost" size="icon" aria-label="上一筆審查" title="上一筆" disabled={index <= 0 || saving} onClick={() => go(index - 1)}><ChevronLeft /></Button>
        <select aria-label="審查項目" title={row.title} value={row.key} disabled={saving} onChange={event => jump(event.target.value)}>{rows.map(item => <option key={item.key} value={item.key}>#{numbers.get(item.key)} · {item.severity} · {item.refdes.join(", ")} · {item.title}</option>)}</select>
        <Button variant="ghost" size="icon" aria-label="下一筆審查" title="下一筆" disabled={index + 1 >= rows.length || saving} onClick={() => go(index + 1)}><ChevronRight /></Button>
        <Button variant="ghost" size="icon" aria-label="最後一筆審查" title="最後一筆" disabled={index + 1 >= rows.length || saving} onClick={() => go(rows.length - 1)}><ChevronsRight /></Button>
      </div>
      <span className="comparison-review-progress">第 {index + 1} / {rows.length} 筆</span>
      <div className="comparison-review-shortcuts">
        <Button size="sm" variant="ghost" disabled={!row.refdes.length || saving} onClick={() => { for (let offset = 1; offset < rows.length; offset++) { const next = rows[(index + offset) % rows.length]; if (next.refdes.join(",") === row.refdes.join(",")) { jump(next.key); return; } } setMessage("目前篩選結果沒有下一個相同 RefDes。"); }}>下一個同 RefDes</Button>
        <Button size="sm" variant="ghost" disabled={!session.lastReviewKey || saving || !session.result.rows.some(item => item.key === session.lastReviewKey)} onClick={() => session.lastReviewKey && jump(session.lastReviewKey)}>回上次審到</Button>
        <details className="comparison-review-settings">
          <summary><SlidersHorizontal />圖面設定</summary>
          <div className="comparison-review-view-options">
            <label>定位縮放<select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={0}>符合視窗</option>{[150, 200, 300, 400].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
            <label>線路圖高度<select value={height} onChange={event => setHeight(Number(event.target.value))}><option value={0}>配合螢幕</option><option value={460}>筆電 · 460 px</option><option value={740}>桌機 · 740 px</option><option value={1090}>大螢幕 · 1090 px</option></select></label>
            <label><input type="checkbox" checked={showPdf} onChange={event => setShowPdf(event.target.checked)} />顯示線路圖</label>
          </div>
        </details>
      </div>
    </div>
    <div className="comparison-review-bench">
      {showPdf && <div className="comparison-pdf-grid" data-mobile-side={mobileSide}>
        <div className="comparison-pdf-mobile-sides" role="group" aria-label="切換線路圖">
          <Button size="sm" variant={mobileSide === "a" ? "secondary" : "ghost"} aria-pressed={mobileSide === "a"} onClick={() => setMobileSide("a")}>A · {session.result.meta.a.label}</Button>
          <Button size="sm" variant={mobileSide === "b" ? "secondary" : "ghost"} aria-pressed={mobileSide === "b"} onClick={() => setMobileSide("b")}>B · {session.result.meta.b.label}</Button>
        </div>
        <PdfFrame key={`${session.id}:a`} row={row} side="a" artifact={session.result.artifacts.find(item => item.key === "schematic_a")} label={session.result.meta.a.label} url={urls.a} location={locationsA.get(row.key)} zoom={zoom} height={height} />
        <PdfFrame key={`${session.id}:b`} row={row} side="b" artifact={session.result.artifacts.find(item => item.key === "schematic")} label={session.result.meta.b.label} url={urls.b} location={locationsB.get(row.key)} zoom={zoom} height={height} />
      </div>}
      <div className="comparison-review-inspector">
        <section className="comparison-review-current" aria-label="目前審查項目">
          <div className="comparison-review-kicker"><span>#{numbers.get(row.key)}</span><span className={`comparison-severity is-${row.severity.toLowerCase()}`}>{row.severity}</span><span title={row.rule}>{row.rule}</span></div>
          <h3>{row.title}</h3>
          {row.refdes.length > 0 && <div className="comparison-review-refs">{row.refdes.join("、")}</div>}
          {(row.detail || row.nets.length > 0 || row.pins.length > 0) && <details className="comparison-review-evidence" key={`evidence:${row.key}`}><summary>差異詳情</summary>{row.detail && <p>{row.detail}</p>}{row.nets.length > 0 && <p>Net：{row.nets.join("、")}</p>}{row.pins.length > 0 && <p>Pin：{row.pins.join("、")}</p>}</details>}
          {row.parent && <Button size="sm" variant="link" onClick={() => jump(row.parent!)}>查看根因 #{numbers.get(row.parent)}</Button>}
          {!!children.length && <details className="comparison-review-children" key={`children:${row.key}`}><summary>同根因子項 · {children.length} 筆</summary>{children.map(child => <Button key={child.key} size="sm" variant="outline" onClick={() => jump(child.key)}>#{numbers.get(child.key)} · {child.severity} · {child.title}</Button>)}</details>}
        </section>
        <section className="comparison-review-compose"><h3>審查回覆</h3><ReviewReplyFields prefix="side-reply" value={draft} disabled={!canEdit || saving || busy} onChange={(field, value) => { setMessage(""); setDrafts(current => ({ ...current, [row.key]: { ...current[row.key], [field]: value } })); }} />
          <p className="comparison-review-feedback" role="status">{message || (drafts[row.key] ? "此筆有未儲存的修改" : Object.keys(drafts).length ? `另有 ${Object.keys(drafts).length} 筆未儲存草稿` : draft.filled ? `填寫日期：${draft.filled}` : "尚未填寫")}</p>
          <div className="comparison-review-actions"><Button size="sm" variant={index + 1 >= rows.length ? "default" : "outline"} disabled={!canEdit || saving || busy} onClick={() => void save()}><Save />{saving ? "儲存中…" : "儲存回覆"}</Button>{index + 1 < rows.length && <Button size="sm" disabled={!canEdit || saving || busy} onClick={() => void save(true)}>儲存並下一筆<ArrowRight /></Button>}</div>
        </section>
      </div>
    </div>
  </div>;
}

export function ComparisonBatchReview({ session, rows, canEdit, busy, onSave, onOpen }: { session: ComparisonSession; rows: TrackRow[]; canEdit: boolean; busy: boolean; onSave: (patches: ReplyPatches) => Promise<void>; onOpen: (row: TrackRow) => void }) {
  const [patches, setPatches] = useState<ReplyPatches>({});
  const [page, setPage] = useState(0);
  const [height, setHeight] = useState(460);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<Promise<void>>(Promise.resolve());
  const numbers = useMemo(() => new Map(session.result.rows.map((item, index) => [item.key, index + 1])), [session.result.rows]);
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const save = (changes: ReplyPatches) => {
    if (!canEdit || busy || !Object.keys(changes).length) return;
    setSaving(true);
    pending.current = pending.current.catch(() => {}).then(async () => {
      try {
        await onSave(changes);
        setPatches(current => {
          const next = { ...current };
          for (const [key, patch] of Object.entries(changes)) {
            const remaining = { ...next[key] };
            for (const [field, value] of Object.entries(patch)) if (remaining[field] === value) delete remaining[field];
            if (Object.keys(remaining).length) next[key] = remaining; else delete next[key];
          }
          return next;
        });
        setMessage("回覆已儲存");
      } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    });
    const current = pending.current;
    void current.finally(() => { if (pending.current === current) setSaving(false); });
  };
  return <section className="comparison-batch-review">
    <div className="comparison-review-view-options"><label>表格高度<select value={height} onChange={event => setHeight(Number(event.target.value))}><option value={460}>筆電 · 460 px</option><option value={740}>桌機 · 740 px</option><option value={1090}>大螢幕 · 1090 px</option></select></label><span role="status">{message || "直接編輯回覆欄位，離開欄位後自動儲存"}</span><Button disabled={!canEdit || busy || saving || !Object.keys(patches).length} onClick={() => save(patches)}>儲存全部草稿（{Object.keys(patches).length}）</Button></div>
    <div className="comparison-batch-scroll" style={{ maxHeight: height }}><table className="comparison-batch-table"><thead><tr>{["項次", "嚴重度", "規則／說明", "父項", "RefDes／Net", "處置", "負責人", "預計版次", "備註", "填寫日期", "操作"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.slice(currentPage * 50, (currentPage + 1) * 50).map(row => {
      const reply = { ...EMPTY_REPLY, ...session.replies[row.key], ...patches[row.key] };
      const edit = (field: keyof ReplyPatch, value: string) => { setMessage(""); setPatches(current => ({ ...current, [row.key]: { ...current[row.key], [field]: value } })); };
      const commit = (field: keyof ReplyPatch) => { if (patches[row.key]?.[field] !== undefined) save({ [row.key]: { [field]: patches[row.key][field] } }); };
      return <tr key={row.key}><td>#{numbers.get(row.key)}</td><td>{row.severity}</td><td><strong>{row.title}</strong><small>{row.rule}</small></td><td>{row.parent ? `#${numbers.get(row.parent)}` : "—"}</td><td>{row.refdes.join(", ")}<small>{row.nets.join(", ")}</small></td><td><select aria-label={`#${numbers.get(row.key)} 處置`} disabled={!canEdit || busy} value={reply.disp} onChange={event => { edit("disp", event.target.value); save({ [row.key]: { disp: event.target.value } }); }}><option value="">未填</option>{[...new Set([...DISPOSITIONS, reply.disp].filter(Boolean))].map(value => <option key={value}>{value}</option>)}</select></td>{(["owner", "target_rev", "note"] as const).map(field => <td key={field}><Input aria-label={`#${numbers.get(row.key)} ${{ owner: "負責人", target_rev: "預計版次", note: "備註" }[field]}`} value={reply[field]} disabled={!canEdit || busy} maxLength={field === "note" ? 10000 : 120} onChange={event => edit(field, event.target.value)} onBlur={() => commit(field)} /></td>)}<td>{reply.filled || "—"}</td><td><Button variant="outline" onClick={() => onOpen(row)}>看圖／檢視</Button></td></tr>;
    })}{!rows.length && <tr><td colSpan={11} className="comparison-empty-result">目前篩選條件沒有符合的比對結果</td></tr>}</tbody></table></div>
    <footer className="comparison-results-footer"><span>每頁 50 筆 · 第 {currentPage + 1}／{pages} 頁 · 草稿不因篩選或翻頁遺失</span><div><Button variant="outline" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一頁</Button><Button variant="outline" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一頁</Button></div></footer>
  </section>;
}
