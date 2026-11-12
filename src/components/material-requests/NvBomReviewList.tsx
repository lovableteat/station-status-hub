import { useId, useState } from "react";
import { ChevronDown, Copy, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NV_BOM_FIELDS, type NvBomAnnotation, type NvBomPart } from "./nvBomCompare";
import { NV_BOM_INTERPRETATION_LABELS, NV_BOM_SCOPE_LABELS, type NvBomInterpretedChange } from "./nvBomInterpretation";
import { currentBomCandidateLabel, NV_BOM_TABLE_LINK_LABELS, type NvBomTableCandidate, type NvBomTableLink } from "./nvBomTableMatch";
export type NvBomReviewLink = NvBomTableLink & { relatedMain?: boolean };

function CurrentBomEvidence({ candidate }: { candidate: NvBomTableCandidate }) {
  const context = [candidate.sourceRow && `表格來源第 ${candidate.sourceRow} 列`, candidate.assemblyName, candidate.sectionName].filter(Boolean).join(" · ");
  return <span>{[candidate.refDes, candidate.mpn, candidate.manufacturer, currentBomCandidateLabel(candidate)].filter(Boolean).join(" · ")}{context && <small className="nv-bom-help block">{context}</small>}</span>;
}

function RefPreview({ values, label }: { values: string[]; label?: string }) {
  const preview = `${label ?? ""}${values.slice(0, 3).join("、")}`;
  return <span className="nv-bom-ref-preview"><span title={preview}>{preview}</span>{values.length > 3 && <small>＋{values.length - 3}</small>}</span>;
}

function SourceEvidence({ part, label, onCopy }: { part?: NvBomPart; label: string; onCopy: (value: string) => void }) {
  const extra = ([['materialCategory', '物料分類'], ['mountMethod', '製程 S/D'], ['population', '上件標記'], ['source', '來源欄']] as const).flatMap(([key, field]) => {
    const values = [...new Set(part?.metadata?.map(row => row[key]).filter(Boolean))];
    return values.length ? [{ field, value: values.join("、") }] : [];
  });
  return <section className="nv-bom-source-evidence" aria-label={label}>
    <h4>{label}{part && <small>Excel 第 {part.sourceRows.join("、")} 列</small>}</h4>
    {part ? <dl>{NV_BOM_FIELDS.map(({ key, label: field }) => <div key={key}>
      <dt>{field}</dt><dd>{part[key] || "—"}{part[key] && (key === "partNumber" || key === "mpn") && <button type="button" aria-label={`複製${key === "mpn" ? " MPN" : "料號"} ${part[key]}`} onClick={() => onCopy(part[key])}><Copy aria-hidden="true" /></button>}</dd>
    </div>)}{extra.map(({ field, value }) => <div key={field}><dt>{field}</dt><dd>{value}</dd></div>)}</dl> : <p>此版本無這筆資料</p>}
  </section>;
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
  const identityChange = prior && next && (kind === "replacement" || kind === "sourceChanged")
    ? (prior.mpn !== next.mpn || prior.manufacturer !== next.manufacturer
      ? [[prior.mpn, prior.manufacturer], [next.mpn, next.manufacturer]].map(values => values.filter(Boolean).join(" · ") || "未提供").join(" → ")
      : prior.partNumber !== next.partNumber ? `${prior.partNumber || "未提供"} → ${next.partNumber || "未提供"}` : "") : "";
  const singleVersion = change.kind !== "changed";
  const itemDescription = singleVersion ? part.mpn || part.partNumber : part.description || name;
  const detailLine = [itemDescription, !singleVersion && !identityChange && part.mpn, !identityChange && part.manufacturer].filter(Boolean).join(" · ");
  const changedLabels = kind === "other" ? NV_BOM_FIELDS.filter(({ key }) => change.changedFields.includes(key)).map(({ label }) => label) : [];
  const title = singleVersion ? part.description || part.mpn || name : changedLabels.length ? `${changedLabels.join("、")}變更` : summary;
  const match = link?.state === "matched" ? link.candidates[0] : undefined;
  const anchorRefs = (relatedMain.after ?? relatedMain.before)?.refs;
  const refs = (part.refs || anchorRefs || "").split(/[\s,，;；、]+/).filter(Boolean);
  const refChanges = [
    { label: "改上件", values: mountedRefs }, { label: "改不上件", values: unmountedRefs },
    { label: "移除位號", values: removedRefs }, { label: "新增位號", values: addedRefs },
  ].filter(({ values }) => values.length > 0);
  return <article data-kind={change.kind} data-action={kind} data-scope={scope} data-checked={Boolean(note?.checked)}>
    <div className="nv-bom-result-line">
      <label className="nv-bom-verify"><input type="checkbox" aria-label={`已核對 ${name}`} checked={Boolean(note?.checked)} onChange={event => onAnnotate({ checked: event.target.checked })} /><span className="sr-only">已核對</span></label>
      <div className="nv-bom-result-main">
        <div className="nv-bom-result-labels"><span className="nv-bom-kind">{NV_BOM_INTERPRETATION_LABELS[kind]}</span><span>{NV_BOM_SCOPE_LABELS[scope]}</span></div>
        <strong>{title}</strong>
        {identityChange && <span className="nv-bom-identity-change">{identityChange}</span>}
        {detailLine && <small title={detailLine}>{detailLine}</small>}
      </div>
      <div className="nv-bom-result-refs" aria-label="位號摘要">
        {refChanges.length ? refChanges.map(({ label, values }) => <RefPreview key={label} label={`${label} `} values={values} />)
          : refs.length > 0 ? <RefPreview label={!part.refs && anchorRefs ? "主料 " : undefined} values={refs} /> : <small>無位號</small>}
      </div>
      <div className="nv-bom-current-cell">
        {match ? <>
          {link?.relatedMain && <small>關聯主料</small>}
          <strong title={currentBomCandidateLabel(match) || match.mpn}>{currentBomCandidateLabel(match) || match.mpn || "已對應"}</strong>
          {onLocate && <button type="button" className="nv-bom-locate" onClick={() => onLocate(match)}><LocateFixed aria-hidden="true" />定位目前表格</button>}
        </> : <small>{link?.relatedMain && "關聯主料 · "}{link?.reason === "manufacturer-mismatch" ? "廠商名稱不同，請核對" : link ? NV_BOM_TABLE_LINK_LABELS[link.state] : "無目前表格對照"}{link?.state === "ambiguous" && ` ${link.candidates.length} 筆`}</small>}
      </div>
      <button type="button" className="nv-bom-details-toggle" aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => setOpen(value => !value)} title={open ? "收合詳情" : "查看詳情"}>
        <ChevronDown aria-hidden="true" /><span>{open ? "收合詳情" : "查看詳情"}</span>
      </button>
    </div>
    {open && <div className="nv-bom-result-details" id={detailsId}>
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
      <div className="nv-bom-evidence-grid"><SourceEvidence part={change.before} label="舊版" onCopy={onCopy} /><SourceEvidence part={change.after} label="新版" onCopy={onCopy} /></div>
      {showAi && <section className="nv-bom-ai-evidence"><h4>AI 核對建議</h4>{change.advice ? <><p>{change.advice}</p><small>{change.aiNote}</small></> : <p>尚未完成 AI 核對</p>}</section>}
      <label className="nv-bom-note">人工備註<textarea aria-label={`${name} 人工備註`} rows={2} value={note?.note ?? ""} onChange={event => onAnnotate({ note: event.target.value })} placeholder="記下核對結果…" /></label>
    </div>}
  </article>;
}
