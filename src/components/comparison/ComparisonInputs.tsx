import { useId, useMemo, useRef, useState, type DragEvent, type InputHTMLAttributes } from "react";
import { Check, FilePlus2, FolderOpen, AlertCircle, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filePath, formatBytes, inspectRevision, INPUT_ROLES, INPUT_ROLE_DETAILS, REQUIRED_ROLES } from "./files";
import type { InputRole } from "./types";
import { isFileDrag, readDroppedFiles } from "@/lib/droppedFiles";

export interface RevisionInput { files: File[]; selected: Partial<Record<InputRole, string>>; }
const roles = INPUT_ROLES.map(key => ({ key, ...INPUT_ROLE_DETAILS[key], required: REQUIRED_ROLES.includes(key) }));

export function ComparisonInputs({ side, label, onLabel, value, onChange, disabled }: { side: "A" | "B"; label: string; onLabel: (value: string) => void; value: RevisionInput; onChange: (value: RevisionInput) => void; disabled: boolean }) {
  const folder = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const inventory = useMemo(() => {
    try { return { data: inspectRevision(value.files), error: "" }; }
    catch (error) { return { data: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [value.files]);
  const rows = roles.map(role => {
    const candidates = inventory.data?.roles[role.key] ?? [];
    const selected = value.selected[role.key];
    const chosen = selected === undefined ? (candidates.length === 1 ? candidates[0] : null) : candidates.find(file => filePath(file) === selected) ?? null;
    const state = chosen ? "ready" : role.required || candidates.length > 1 && selected !== "" ? "missing" : "optional";
    const status = chosen ? "已選取" : candidates.length > 1 && selected !== "" ? "待選來源" : role.required ? (value.files.length ? "缺少檔案" : "未選取") : selected === "" ? "不使用" : "選用";
    return { role, candidates, selected, chosen, state, status };
  });
  const readyCount = rows.filter(row => row.role.required && row.chosen).length;
  const selectFiles = (list: FileList | null) => { if (list?.length) onChange({ files: Array.from(list), selected: {} }); };
  // A folder dragged in is read without Chrome's "upload N files to this site?" confirmation.
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState("");
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (disabled || !isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  };
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (disabled || !isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    setDragging(false);
    const dropped = readDroppedFiles(event.dataTransfer);
    void dropped.files
      .then(list => { setDropError(""); if (list.length) onChange({ files: list, selected: {} }); })
      .catch(() => setDropError("這個資料夾讀不到，請改用「選擇資料夾」"));
  };
  const directoryProps = { webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>;
  return <section className="comparison-input-panel" aria-label={`${side} 版資料`} data-side={side} data-has-files={value.files.length > 0} data-dragging={dragging || undefined} onDragOver={handleDragOver} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={handleDrop}>
    <div className="comparison-input-heading"><span className="comparison-revision-mark">{side}</span><div className="comparison-revision-title"><h2>{side === "A" ? "舊版資料" : "新版資料"}</h2><p>{side === "A" ? "作為比對基準的版本" : "要檢查的改版內容"}</p></div><div className="comparison-revision-name"><Label htmlFor={labelId}>版本名稱</Label><Input id={labelId} aria-label={`${side} 版名稱`} value={label} onChange={event => onLabel(event.target.value)} maxLength={64} disabled={disabled} className="comparison-revision-label" /></div></div>
    {!inventory.error && <p className="comparison-required-summary" data-ready={readyCount === REQUIRED_ROLES.length} role="status">{readyCount === REQUIRED_ROLES.length ? <Check /> : <AlertCircle />}<span>必要檔案 <strong>{readyCount}／{REQUIRED_ROLES.length}</strong></span><span>{readyCount === REQUIRED_ROLES.length ? "已選齊" : `還需 ${REQUIRED_ROLES.length - readyCount} 份`}</span></p>}
    <div className="comparison-file-actions"><Button variant="outline" className="comparison-folder-action" disabled={disabled} onClick={() => folder.current?.click()}><FolderOpen />選擇資料夾</Button><Button variant="ghost" disabled={disabled} onClick={() => files.current?.click()}><FilePlus2 />選擇檔案</Button><span className="comparison-drop-hint">或把資料夾拖進來，不會跳確認視窗</span></div>{dropError && <p className="comparison-alert" role="alert">{dropError}</p>}
    <input ref={folder} {...directoryProps} type="file" multiple className="sr-only" aria-label={`選取 ${side} 版資料夾`} onChange={event => selectFiles(event.target.files)} disabled={disabled} />
    <input ref={files} type="file" multiple className="sr-only" aria-label={`選取 ${side} 版檔案`} accept=".dat,.xls,.xlsx,.csv,.htm,.html,.dsn,.pdf" onChange={event => selectFiles(event.target.files)} disabled={disabled} />
    {inventory.error ? <p className="comparison-alert" role="alert">{inventory.error}</p> : <div className="comparison-input-inventory">{rows.map(({ role, candidates, selected, chosen, state, status }) => {
      return <div key={role.key} className="comparison-input-file" data-state={state} data-required={Boolean(role.required)}><span className={chosen ? "comparison-good" : state === "missing" ? "comparison-missing" : "text-muted-foreground"}>{chosen ? <Check /> : state === "missing" ? <AlertCircle /> : <Minus />}</span><div className="comparison-file-role"><span>{role.label}<small>{role.required ? "必要" : "選用"}</small></span><span className="comparison-role-filename">{role.hint}</span></div>{candidates.length > 1 ? <Select value={selected === "" && !role.required ? "skip" : selected || "choose"} onValueChange={path => onChange({ ...value, selected: { ...value.selected, [role.key]: path === "skip" ? "" : path } })} disabled={disabled}><SelectTrigger aria-label={`${side} 版${role.label}來源`} className="comparison-file-source"><SelectValue placeholder="選擇來源" /></SelectTrigger><SelectContent>{!role.required && <SelectItem value="skip">不使用</SelectItem>}<SelectItem value="choose" disabled>請選擇一份來源</SelectItem>{candidates.map(file => <SelectItem value={filePath(file)} key={filePath(file)}>{filePath(file)}</SelectItem>)}</SelectContent></Select> : <span className="comparison-file-name" title={chosen ? filePath(chosen) : ""}>{chosen?.name ?? "—"}</span>}<span className="comparison-file-status">{status}</span></div>;
    })}</div>}
    <p className="comparison-input-footnote">{value.files.length ? `${value.files.length} 份檔案 · ${formatBytes(inventory.data?.totalBytes ?? 0)}${inventory.data?.ignored ? ` · ${inventory.data.ignored} 份不相關檔案略過` : ""}` : "每版必備：Netlist 三份 .dat、BOM 用料表、電路圖 PDF。可一次選取版本資料夾，子資料夾也會辨識。"}</p>
  </section>;
}
