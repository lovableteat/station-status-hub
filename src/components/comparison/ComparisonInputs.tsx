import { useId, useMemo, useRef, useState, type DragEvent, type InputHTMLAttributes } from "react";
import { Check, FilePlus2, FolderOpen, AlertCircle, Minus, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addRevisionFiles, filePath, formatBytes, inspectRevision, removeRevisionFile, roleMismatch, INPUT_ROLES, INPUT_ROLE_ACCEPT, INPUT_ROLE_DETAILS, REQUIRED_ROLES, NETLIST_ROLES, type RevisionSelection } from "./files";
import type { InputRole } from "./types";
import { isFileDrag, readDroppedFiles } from "@/lib/droppedFiles";

export type RevisionInput = RevisionSelection;

export function ComparisonInputs({ side, step, label, onLabel, value, onChange, disabled, single = false }: { side: "A" | "B"; step?: number; label: string; onLabel: (value: string) => void; value: RevisionInput; onChange: (value: RevisionInput) => void; disabled: boolean; single?: boolean }) {
  const required = single ? NETLIST_ROLES : REQUIRED_ROLES;
  const roles = INPUT_ROLES.map(key => ({ key, ...INPUT_ROLE_DETAILS[key], required: required.includes(key) }));
  const folder = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  // One hidden input serves every slot; the slot asking for a file is remembered until the dialog closes.
  const slot = useRef<HTMLInputElement>(null);
  const slotRole = useRef<InputRole | null>(null);
  const labelId = useId();
  const board = single ? "這張板子的" : side === "A" ? "舊版" : "新版";
  const inventory = useMemo(() => {
    try { return { data: inspectRevision(value.files), error: "" }; }
    catch (error) { return { data: null, error: error instanceof Error ? error.message : String(error) }; }
  }, [value.files]);
  const rows = roles.map(role => {
    const candidates = inventory.data?.roles[role.key] ?? [];
    const selected = value.selected[role.key];
    const chosen = selected === undefined ? (candidates.length === 1 ? candidates[0] : null) : candidates.find(file => filePath(file) === selected) ?? null;
    const state = chosen ? "ready" : role.required || candidates.length > 1 && selected !== "" ? "missing" : "optional";
    const status = chosen ? "已選取" : candidates.length > 1 && selected !== "" ? "待選來源" : role.required ? (value.files.length ? "這一版缺這份" : "尚未選擇") : selected === "" ? "不使用" : "選用，可不放";
    return { role, candidates, selected, chosen, state, status };
  });
  const readyCount = rows.filter(row => row.role.required && row.chosen).length;
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState("");
  // A folder is one whole version, so it replaces what was there. A folder with nothing usable is refused instead of wiping the panel.
  const loadFolder = (list: File[]) => {
    if (!list.length) return;
    if (inspectRevision(list).ignored === list.length) { setProblem(`這個資料夾的 ${list.length} 份檔案裡沒有 Netlist、BOM 或電路圖 PDF，請確認選的是${board}資料夾`); return; }
    setProblem("");
    onChange({ files: list, selected: {} });
  };
  // Loose files are added to the version, so sources kept in different folders can be picked one after another.
  const addFiles = (list: File[]) => {
    if (!list.length) return;
    if (inspectRevision(list).ignored === list.length) { setProblem(`${list.length === 1 ? `「${list[0].name}」` : `這 ${list.length} 份檔案`}不是比對會用到的類型；可以放 Netlist .dat、BOM 用料表、電路圖 PDF 或 .dsn`); return; }
    setProblem("");
    onChange(addRevisionFiles(value, list));
  };
  const pickSlot = (role: InputRole) => {
    const input = slot.current;
    if (!input) return;
    slotRole.current = role;
    input.accept = INPUT_ROLE_ACCEPT[role];
    input.value = "";
    input.click();
  };
  const fillSlot = (list: FileList | null) => {
    const role = slotRole.current;
    const file = list?.[0];
    if (!role || !file) return;
    const mismatch = roleMismatch(role, file);
    if (mismatch) { setProblem(mismatch); return; }
    setProblem("");
    onChange(addRevisionFiles(value, [file]));
  };
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (disabled || !isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  };
  // A folder dragged in is read without Chrome's "upload N files to this site?" confirmation.
  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (disabled || !isFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    setDragging(false);
    const dropped = readDroppedFiles(event.dataTransfer);
    void dropped.files
      .then(list => (dropped.hasDirectory ? loadFolder(list) : addFiles(list)))
      .catch(() => setProblem("這個資料夾讀不到，請改用「選擇資料夾」"));
  };
  const directoryProps = { webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>;
  return <section className="comparison-input-panel" aria-label={`${side} 版資料`} data-side={side} data-has-files={value.files.length > 0} data-ready={readyCount === required.length} data-dragging={dragging || undefined} onDragOver={handleDragOver} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={handleDrop}>
    <div className="comparison-input-heading">
      <span className="comparison-revision-mark">{single ? "單" : side}</span>
      <div className="comparison-revision-title"><h2>{single ? "單板資料" : side === "A" ? "舊版資料" : "新版資料"}</h2><p>{step ? `步驟 ${step} · ` : ""}{single ? "只產生這張板子的 Power Tree 與 I²C Map" : side === "A" ? "作為比對基準的版本" : "要檢查的改版內容"}</p></div>
      {!inventory.error && <p className="comparison-required-summary" data-ready={readyCount === required.length} role="status">{readyCount === required.length ? <Check /> : <AlertCircle />}<span>必要檔案 <strong>{readyCount}／{required.length}</strong></span><span>{readyCount === required.length ? "已選齊" : `還需 ${required.length - readyCount} 份`}</span></p>}
      <div className="comparison-revision-name"><Label htmlFor={labelId}><PenLine />版本名稱（可改）</Label><Input id={labelId} aria-label={single ? "單板版本名稱" : `${side} 版名稱`} title="會寫進報表檔名與比對紀錄，例如 EVT、DVT" value={label} onChange={event => onLabel(event.target.value)} maxLength={64} disabled={disabled} className="comparison-revision-label" /></div>
    </div>
    <div className="comparison-dropzone">
      <FolderOpen className="comparison-dropzone-icon" aria-hidden="true" />
      <div className="comparison-dropzone-text"><strong>把{board}資料夾拖到這裡</strong><span className="comparison-drop-hint">檔案會自動對到下面各格；拖曳不會跳確認視窗</span></div>
      <div className="comparison-file-actions"><Button variant="outline" className="comparison-folder-action" disabled={disabled} onClick={() => folder.current?.click()}><FolderOpen />選擇資料夾</Button><Button variant="ghost" disabled={disabled} title="一次加入一份或多份檔案，原本選好的會保留" onClick={() => files.current?.click()}><FilePlus2 />加入檔案</Button>{value.files.length > 0 && <Button variant="ghost" disabled={disabled} aria-label={`清除 ${side} 版已選的檔案`} onClick={() => { setProblem(""); onChange({ files: [], selected: {} }); }}><X />清除</Button>}</div>
    </div>
    {problem && <p className="comparison-alert comparison-input-problem" role="alert"><AlertCircle /><span>{problem}</span><Button variant="ghost" size="icon" aria-label="關閉這則提示" onClick={() => setProblem("")}><X /></Button></p>}
    <input ref={folder} {...directoryProps} type="file" multiple className="sr-only" aria-label={`選取 ${side} 版資料夾`} onChange={event => { loadFolder(Array.from(event.target.files ?? [])); event.target.value = ""; }} disabled={disabled} />
    <input ref={files} type="file" multiple className="sr-only" aria-label={`選取 ${side} 版檔案`} accept=".dat,.xls,.xlsx,.csv,.htm,.html,.bom,.txt,.dsn,.pdf" onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} disabled={disabled} />
    <input ref={slot} type="file" className="sr-only" tabIndex={-1} aria-label={`選取 ${side} 版單一檔案`} onChange={event => { fillSlot(event.target.files); event.target.value = ""; }} disabled={disabled} />
    {inventory.error ? <p className="comparison-alert" role="alert">{inventory.error}</p> : <div className="comparison-input-inventory">{rows.map(({ role, candidates, selected, chosen, state, status }) => {
      return <div key={role.key} className="comparison-input-file" data-slot={role.key} data-state={state} data-required={Boolean(role.required)}>
        <span className={chosen ? "comparison-good" : state === "missing" ? "comparison-missing" : "text-muted-foreground"}>{chosen ? <Check /> : state === "missing" ? <AlertCircle /> : <Minus />}</span>
        <div className="comparison-file-role"><span>{role.label}<small>{role.required ? "必要" : "選用"}</small></span><span className="comparison-role-filename">{role.hint}</span></div>
        {candidates.length > 1 ? <Select value={selected === "" && !role.required ? "skip" : selected || "choose"} onValueChange={path => onChange({ ...value, selected: { ...value.selected, [role.key]: path === "skip" ? "" : path } })} disabled={disabled}><SelectTrigger aria-label={`${side} 版${role.label}來源`} className="comparison-file-source"><SelectValue placeholder="選擇來源" /></SelectTrigger><SelectContent>{!role.required && <SelectItem value="skip">不使用</SelectItem>}<SelectItem value="choose" disabled>有 {candidates.length} 份，請選一份</SelectItem>{candidates.map(file => <SelectItem value={filePath(file)} key={filePath(file)}>{filePath(file)}</SelectItem>)}</SelectContent></Select> : <span className="comparison-file-name" data-empty={!chosen || undefined} title={chosen ? filePath(chosen) : ""}>{chosen ? chosen.name : status}</span>}
        <div className="comparison-slot-actions">
          <Button type="button" size="sm" variant={chosen ? "ghost" : "outline"} className="comparison-slot-pick" disabled={disabled} aria-label={`${chosen ? "更換" : "選擇"} ${side} 版${role.label}`} onClick={() => pickSlot(role.key)}>{chosen ? "更換" : candidates.length > 1 ? "另選檔案" : "選擇檔案"}</Button>
          {chosen && !role.required && <Button type="button" size="icon" variant="ghost" className="comparison-slot-remove" disabled={disabled} aria-label={`移除 ${side} 版${role.label}`} title="不使用這份檔案" onClick={() => onChange(removeRevisionFile(value, filePath(chosen)))}><X /></Button>}
        </div>
      </div>;
    })}</div>}
    <p className="comparison-input-footnote">{value.files.length ? `${value.files.length} 份檔案 · ${formatBytes(inventory.data?.totalBytes ?? 0)}${inventory.data?.ignored ? ` · ${inventory.data.ignored} 份用不到的檔案已略過，不會讀取` : ""}` : single ? "單板必備：Netlist 三份 .dat；BOM、DSN、PDF 選用。缺 BOM 時仍可畫圖，輸入完整性提醒會保留。" : "每版必備：Netlist 三份 .dat、BOM 用料表、電路圖 PDF。可一次選取版本資料夾，子資料夾也會辨識；檔案不在同一處時，用各列的「選擇檔案」逐份放入。"}</p>
  </section>;
}
