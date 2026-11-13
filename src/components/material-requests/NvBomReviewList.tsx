import { useId, useState } from "react";
import { ChevronDown, Copy, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NV_BOM_FIELDS, placementRefs, type NvBomAnnotation, type NvBomField, type NvBomPart } from "./nvBomCompare";
import { NV_BOM_INTERPRETATION_LABELS, NV_BOM_SCOPE_LABELS, nvBomSourceListDelta, type NvBomInterpretedChange } from "./nvBomInterpretation";
import { currentBomCandidateLabel, NV_BOM_TABLE_LINK_LABELS, type NvBomTableCandidate, type NvBomTableLink } from "./nvBomTableMatch";
export type NvBomReviewLink = NvBomTableLink & { relatedMain?: boolean };

function CurrentBomEvidence({ candidate }: { candidate: NvBomTableCandidate }) {
  const context = [candidate.sourceRow && `表格來源第 ${candidate.sourceRow} 列`, candidate.assemblyName, candidate.sectionName].filter(Boolean).join(" · ");
  return <span>{[candidate.refDes, candidate.mpn, candidate.manufacturer, currentBomCandidateLabel(candidate)].filter(Boolean).join(" · ")}{context && <small className="nv-bom-help block">{context}</small>}</span>;
}

function RefPreview({ values, label }: { values: string[]; label?: string }) {
  const preview = `${label ?? ""}${values.slice(0, 3).join("、")}`;
  return <span className="nv-bom-ref-preview"><span title={preview}>{preview}</span>{values.length > 3 && <small>共 {values.length} 個</small>}</span>;
}

function SourceEvidence({ part, side, changedFields, onCopy }: { part?: NvBomPart; side: "before" | "after"; changedFields: NvBomField[]; onCopy: (value: string) => void }) {
  const label = side === "before" ? "舊版" : "新版";
  const extra = ([['materialCategory', '物料分類'], ['mountMethod', '製程 S/D'], ['population', '上件標記'], ['source', '來源欄']] as const).flatMap(([key, field]) => {
    const values = [...new Set(part?.metadata?.map(row => row[key]).filter(Boolean))];
    return values.length ? [{ field, value: values.join("、") }] : [];
  });
  return <section className="nv-bom-source-evidence" data-side={side} aria-label={label}>
    <h4>{label}{part && <small>Excel 第 {part.sourceRows.join("、")} 列</small>}</h4>
    {part ? <dl>{NV_BOM_FIELDS.map(({ key, label: field }) => <div key={key} data-field-changed={changedFields.includes(key) || undefined}>
      <dt>{field}</dt><dd>{part[key] || "—"}{part[key] && (key === "partNumber" || key === "mpn") && <button type="button" aria-label={`複製${key === "mpn" ? " MPN" : "料號"} ${part[key]}`} onClick={() => onCopy(part[key])}><Copy aria-hidden="true" /></button>}</dd>
    </div>)}{extra.map(({ field, value }) => <div key={field}><dt>{field}</dt><dd>{value}</dd></div>)}</dl> : <p>此版本無這筆資料</p>}
  </section>;
}

type SourceDelta = { field: "廠商" | "廠商料號"; direction: "added" | "removed"; values: string[] };

function SourceDeltaList({ changes, preview = false }: { changes: SourceDelta[]; preview?: boolean }) {
  return <dl className="nv-bom-delta-list">{(["廠商", "廠商料號"] as const).map(field => {
    const group = changes.filter(change => change.field === field);
    if (!group.length) return null;
    return <div key={field} className="nv-bom-delta-field"><dt>{field}</dt>
      <dd>{group.map(({ direction, values }) => {
        const action = direction === "added" ? "新增" : "移除";
        return <div key={direction} role="group" aria-label={`新版${action}${field}：`} className="nv-bom-delta" data-direction={direction}>
          <span className="nv-bom-delta-action" aria-hidden="true">{action}</span>
          <span className="nv-bom-delta-values">{(preview ? values.slice(0, 2) : values).join("、")}</span>
          {preview && values.length > 2 && <small>另 {values.length - 2} 個</small>}
        </div>;
      })}</dd>
    </div>;
  })}</dl>;
}

export function NvBomReviewRow({ entry, link, note, showAi, onAnnotate, onCopy, onLocate }: {
  entry: NvBomInterpretedChange;
  link?: NvBomReviewLink;
  note?: NvBomAnnotation;
  showAi: boolean;
  onAnnotate: (patch: Partial<NvBomAnnotation>) => void;
  onCopy: (value: string) => void;
  onLocate?: (candidate: NvBomTableCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const { change, kind, scope, summary, removedRefs, addedRefs, mountedRefs, unmountedRefs, relatedSourceRows, relatedMain } = entry;
  const part = (change.after ?? change.before)!;
  const name = part.partNumber || part.mpn || `Excel 第 ${part.sourceRows[0]} 列`;
  const prior = change.before, next = change.after;
  const sourceDeltas: SourceDelta[] = [];
  if (prior && next && (kind === "sourceChanged" || kind === "replacement")) {
    for (const [key, field] of [["manufacturer", "廠商"], ["mpn", "廠商料號"]] as const) {
      if (!change.changedFields.includes(key)) continue;
      const { added, removed } = nvBomSourceListDelta(prior[key], next[key]);
      if (added.length) sourceDeltas.push({ field, direction: "added", values: added });
      if (removed.length) sourceDeltas.push({ field, direction: "removed", values: removed });
    }
  }
  const sameList = kind === "sourceChanged" && !sourceDeltas.length && change.changedFields.some(key => key === "mpn" || key === "manufacturer");
  const singleVersion = change.kind !== "changed";
  const detailLine = (singleVersion ? [part.partNumber || part.mpn] : [part.description, part.partNumber]).filter(Boolean).join(" · ");
  const changedLabels = kind === "other" ? NV_BOM_FIELDS.filter(({ key }) => change.changedFields.includes(key)).map(({ label }) => label) : [];
  const title = singleVersion ? part.description || name : kind === "sourceChanged" && sourceDeltas.length ? "新版供料清單有變動"
    : sameList ? "來源欄順序或寫法有變動" : changedLabels.length ? `${changedLabels.join("、")}有變更` : summary;
  const match = link?.state === "matched" ? link.candidates[0] : undefined;
  const anchorRefs = (relatedMain.after ?? relatedMain.before)?.refs;
  const refs = placementRefs(part.refs || anchorRefs || "");
  const refChanges = [
    { label: "改上件", values: mountedRefs, direction: "added" }, { label: "改不上件", values: unmountedRefs, direction: "removed" },
    { label: "移除位號", values: removedRefs, direction: "removed" }, { label: "新增位號", values: addedRefs, direction: "added" },
  ].filter(({ values }) => values.length > 0);
  const sourceContext = [];
  if (kind === "sourceChanged" && sourceDeltas.length && prior && next) {
    const oldRefs = placementRefs(prior.refs), newRefs = placementRefs(next.refs);
    const newRefSet = new Set(newRefs);
    if (oldRefs.length && oldRefs.length === newRefs.length && oldRefs.every(ref => newRefSet.has(ref)) && !refChanges.length) {
      sourceContext.push(`位號清單相同，共 ${newRefs.length} 個。`);
    }
    if (prior.qty && next.qty) sourceContext.push(prior.qty === next.qty ? `用量維持 ${next.qty}。` : `用量由 ${prior.qty} 改為 ${next.qty}。`);
  }
  return <article data-kind={change.kind} data-action={kind} data-scope={scope} data-checked={Boolean(note?.checked)}>
    <div className="nv-bom-result-line">
      <label className="nv-bom-verify"><input type="checkbox" aria-label={`已核對 ${name}`} checked={Boolean(note?.checked)} onChange={event => onAnnotate({ checked: event.target.checked })} /><span className="sr-only">已核對</span></label>
      <div className="nv-bom-result-main">
        <div className="nv-bom-result-labels"><span className="nv-bom-kind">{NV_BOM_INTERPRETATION_LABELS[kind]}</span><span>{NV_BOM_SCOPE_LABELS[scope]}</span></div>
        <strong>{title}</strong>
        {sourceDeltas.length > 0 && <SourceDeltaList changes={sourceDeltas} preview />}
        {sourceContext.length > 0 && <p className="nv-bom-delta-context">{sourceContext.join("")}</p>}
        {detailLine && <small title={detailLine}>{detailLine}</small>}
      </div>
      <div className="nv-bom-result-refs" aria-label="位號摘要">
        {refChanges.length ? refChanges.map(({ label, values, direction }) => <span key={label} data-direction={direction}><RefPreview label={`${label} `} values={values} /></span>)
          : refs.length > 0 ? <RefPreview label={!part.refs && anchorRefs ? "主料 " : undefined} values={refs} /> : <small>{part.refs || anchorRefs ? "請查看位號原文" : "無位號"}</small>}
      </div>
      <div className="nv-bom-current-cell">
        {match ? <>
          {link?.relatedMain && <small>關聯主料</small>}
          <strong title={currentBomCandidateLabel(match) || match.mpn}>{currentBomCandidateLabel(match) || match.mpn || "已對應"}</strong>
          {onLocate && <button type="button" className="nv-bom-locate" onClick={() => onLocate(match)}><LocateFixed aria-hidden="true" />定位目前表格</button>}
        </> : <small data-link-state={link?.state}>{link?.relatedMain && "關聯主料 · "}{link?.reason === "manufacturer-mismatch" ? "廠商名稱不同，請核對" : link?.state === "missing" ? "找不到可定位的料件" : link ? NV_BOM_TABLE_LINK_LABELS[link.state] : "未選擇對照 BOM"}{link?.state === "ambiguous" && ` ${link.candidates.length} 筆`}</small>}
      </div>
      <button type="button" className="nv-bom-details-toggle" aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => setOpen(value => !value)} title={open ? "收合詳情" : "查看詳情"}>
        <ChevronDown aria-hidden="true" /><span>{open ? "收合詳情" : "查看詳情"}</span>
      </button>
    </div>
    {open && <div className="nv-bom-result-details" id={detailsId}>
      {sourceDeltas.length > 0 && <section className="nv-bom-change-evidence" aria-label="來源差異">
        <h4>新舊版供料清單差異</h4>
        <SourceDeltaList changes={sourceDeltas} />
        {sourceContext.length > 0 && <p>{sourceContext.join("")}</p>}
        {sourceDeltas.some(({ field }) => field === "廠商") && sourceDeltas.some(({ field }) => field === "廠商料號") && <p>廠商與料號分欄比對，兩者的對應請核對原始 Excel。</p>}
      </section>}
      {link?.state === "missing" && <p className="nv-bom-help">目前選取的網站 BOM 找不到可對應的列。新舊 Excel 的比對結果仍在下方。</p>}
      {link?.state === "ambiguous" && <section className="nv-bom-current-candidates" aria-label="目前表格候選">
        <h4>目前表格候選</h4>
        {link.candidates.map(candidate => <div key={candidate.id}>
          <CurrentBomEvidence candidate={candidate} />
          {onLocate && <Button type="button" variant="outline" onClick={() => onLocate(candidate)}>定位此列</Button>}
        </div>)}
      </section>}
      {match && <section className="nv-bom-current-candidates" aria-label="目前表格對應">
        <h4>{link?.relatedMain ? "目前表格關聯主料" : "目前表格對應"}</h4>
        <CurrentBomEvidence candidate={match} />
      </section>}
      {refChanges.length > 0 && <dl className="nv-bom-full-ref-changes">{refChanges.map(({ label, values }) => <div key={label}><dt>{label}（{values.length}）</dt><dd>{values.join("、")}</dd></div>)}</dl>}
      {(relatedSourceRows.before.length > 0 || relatedSourceRows.after.length > 0) && <p className="nv-bom-help">關聯的主料來源列 {relatedSourceRows.before.length > 0 && `舊版 ${relatedSourceRows.before.join("、")}`} {relatedSourceRows.after.length > 0 && `新版 ${relatedSourceRows.after.join("、")}`}</p>}
      <div className="nv-bom-evidence-grid"><SourceEvidence part={change.before} side="before" changedFields={change.changedFields} onCopy={onCopy} /><SourceEvidence part={change.after} side="after" changedFields={change.changedFields} onCopy={onCopy} /></div>
      {showAi && <section className="nv-bom-ai-evidence"><h4>AI 建議你檢查什麼</h4>{change.advice ? <><p>{change.advice}</p>{change.aiNote && <details><summary>查看 AI 判讀依據</summary><p>{change.aiNote}</p></details>}</> : <p>這筆還沒有 AI 核對結果。</p>}</section>}
      <label className="nv-bom-note">人工備註<textarea aria-label={`${name} 人工備註`} rows={2} value={note?.note ?? ""} onChange={event => onAnnotate({ note: event.target.value })} placeholder="記下核對結果…" /></label>
    </div>}
  </article>;
}
