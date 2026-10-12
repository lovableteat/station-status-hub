import { useMemo, useRef, type InputHTMLAttributes } from "react";
import { Check, FilePlus2, FolderOpen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filePath, formatBytes, inspectRevision } from "./files";
import type { InputRole } from "./types";

export interface RevisionInput { files: File[]; selected: Partial<Record<InputRole, string>>; }
const roles: Array<{ key: InputRole; label: string; required?: boolean }> = [
  { key: "pstxnet", label: "Net 連線", required: true },
  { key: "pstxprt", label: "零件列表", required: true },
  { key: "pstchip", label: "Pin 定義", required: true },
  { key: "bom", label: "ERP BOM" }, { key: "dsn", label: "OrCAD DSN" }, { key: "pdf", label: "線路圖 PDF" },
];

export function ComparisonInputs({ side, label, onLabel, value, onChange, disabled }: { side: "A" | "B"; label: string; onLabel: (value: string) => void; value: RevisionInput; onChange: (value: RevisionInput) => void; disabled: boolean }) {
  const folder = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const inventory = useMemo(() => {
    try { return { data: inspectRevision(value.files), error: "" }; }
    catch (error) { return { data: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [value.files]);
  const selectFiles = (list: FileList | null) => { if (list?.length) onChange({ files: Array.from(list), selected: {} }); };
  const directoryProps = { webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>;
  return <section className="comparison-input-panel" aria-label={`${side} 版資料`} data-has-files={value.files.length > 0}>
    <div className="comparison-input-heading"><span className="comparison-revision-mark">{side}</span><div><h2>{side === "A" ? "舊版資料" : "新版資料"}</h2><p>{side === "A" ? "作為比對基準的版本" : "要檢查的改版內容"}</p></div><Input aria-label={`${side} 版名稱`} value={label} onChange={event => onLabel(event.target.value)} maxLength={64} disabled={disabled} className="comparison-revision-label" /></div>
    <div className="comparison-file-actions"><Button variant="outline" className="comparison-folder-action" disabled={disabled} onClick={() => folder.current?.click()}><FolderOpen />選擇資料夾</Button><Button variant="ghost" disabled={disabled} onClick={() => files.current?.click()}><FilePlus2 />選擇檔案</Button></div>
    <input ref={folder} {...directoryProps} type="file" multiple className="sr-only" aria-label={`選取 ${side} 版資料夾`} onChange={event => selectFiles(event.target.files)} disabled={disabled} />
    <input ref={files} type="file" multiple className="sr-only" aria-label={`選取 ${side} 版檔案`} accept=".dat,.xls,.xlsx,.csv,.htm,.html,.dsn,.pdf" onChange={event => selectFiles(event.target.files)} disabled={disabled} />
    {inventory.error ? <p className="comparison-alert" role="alert">{inventory.error}</p> : <div className="comparison-input-inventory">{roles.map(role => {
      const candidates = inventory.data?.roles[role.key] ?? [];
      const selected = value.selected[role.key];
      const chosen = selected === "" ? null : candidates.find(file => filePath(file) === selected) ?? (candidates.length === 1 ? candidates[0] : null);
      return <div key={role.key} className="comparison-input-file"><span className={chosen ? "comparison-good" : role.required ? "comparison-missing" : "text-muted-foreground"}>{chosen ? <Check /> : <AlertCircle />}</span><Label>{role.label}{role.required && <small>必要</small>}</Label>{candidates.length > 1 ? <Select value={selected || "choose"} onValueChange={path => onChange({ ...value, selected: { ...value.selected, [role.key]: path === "skip" ? "" : path } })} disabled={disabled}><SelectTrigger aria-label={`${side} 版${role.label}來源`}><SelectValue placeholder="選擇來源" /></SelectTrigger><SelectContent>{!role.required && <SelectItem value="skip">不使用</SelectItem>}<SelectItem value="choose" disabled>請選擇一份來源</SelectItem>{candidates.map(file => <SelectItem value={filePath(file)} key={filePath(file)}>{filePath(file)}</SelectItem>)}</SelectContent></Select> : <span className="comparison-file-name" title={chosen ? filePath(chosen) : ""}>{chosen?.name ?? (role.required ? "尚未選取" : "選用")}</span>}</div>;
    })}</div>}
    <p className="comparison-input-footnote">{value.files.length ? `${value.files.length} 份檔案 · ${formatBytes(inventory.data?.totalBytes ?? 0)}${inventory.data?.ignored ? ` · ${inventory.data.ignored} 份不相關檔案略過` : ""}` : "選取包含 pstxnet、pstxprt、pstchip 的資料夾；子資料夾也會辨識。"}</p>
  </section>;
}
