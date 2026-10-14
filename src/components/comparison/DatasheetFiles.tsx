import { useId, useRef, useState, type InputHTMLAttributes } from "react";
import { ChevronDown, FilePlus2, FolderOpen, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { filePath, formatBytes } from "./files";
import { DATASHEET_BATCH_LIMIT, mergeDatasheetFiles } from "./datasheetSelection";

export interface DatasheetFilesProps {
  value: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
  inputPrefix?: string;
  maxTotalBytes?: number;
}

const directoryProps = { webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>;

export function DatasheetFiles({ value, onChange, disabled, inputPrefix, maxTotalBytes }: DatasheetFilesProps) {
  const folder = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const id = inputPrefix || `comparison-datasheets-${generatedId}`;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const totalBytes = value.reduce((sum, file) => sum + file.size, 0);

  const select = (input: HTMLInputElement) => {
    const selected = input.files ? Array.from(input.files) : [];
    input.value = "";
    if (disabled) return;
    try {
      const result = mergeDatasheetFiles(value, selected, { maxTotalBytes });
      setError("");
      const message = [result.added ? `已加入 ${result.added} 份 PDF` : "沒有新增 PDF"];
      if (result.duplicates) message.push(`略過 ${result.duplicates} 份已選取的 PDF`);
      if (result.skipped) message.push(`略過 ${result.skipped} 份非 PDF 檔案`);
      setNotice(message.join("；"));
      if (result.added) {
        onChange(result.files);
        setExpanded(result.files.length <= 8);
      }
    } catch (cause) {
      setNotice("");
      setError(`${cause instanceof Error ? cause.message : String(cause)}。這批檔案未加入，原本的選擇已保留。`);
    }
  };
  const remove = (file: File) => {
    setError("");
    setNotice(`已移除 ${filePath(file)}`);
    onChange(value.filter(item => item !== file));
  };

  return <section className="comparison-datasheets-picker" aria-label="Datasheet PDF 選取">
    <div className="comparison-datasheets-actions">
      <Button type="button" variant="outline" className="comparison-datasheets-folder" disabled={disabled} onClick={() => folder.current?.click()}><FolderOpen />選擇 Datasheet 資料夾</Button>
      <Button type="button" variant="ghost" disabled={disabled} onClick={() => files.current?.click()}><FilePlus2 />選擇 PDF 檔案</Button>
    </div>
    <input id={`${id}-folder`} ref={folder} {...directoryProps} type="file" multiple className="sr-only" aria-label="選取 Datasheet 資料夾" aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} onChange={event => select(event.currentTarget)} disabled={disabled} />
    <input id={`${id}-files`} ref={files} type="file" multiple accept=".pdf,application/pdf" className="sr-only" aria-label="選取 Datasheet PDF 檔案" aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} onChange={event => select(event.currentTarget)} disabled={disabled} />
    <p id={`${id}-help`} className="comparison-datasheets-help">一次選取整個資料夾，會包含子資料夾的 PDF；可繼續加入其他資料夾，其他格式自動略過。{maxTotalBytes !== undefined && maxTotalBytes > DATASHEET_BATCH_LIMIT ? "最多 1000 份、每份 64 MiB，批次逐份處理。" : "單檔上限 64 MiB，合計 128 MiB／1000 份。"}</p>
    <div className="comparison-datasheets-summary"><p><strong>{value.length} 份 PDF</strong><span> · {formatBytes(totalBytes)}</span></p>{value.length > 0 ? <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setError(""); setNotice("已清空選取的 Datasheet PDF"); onChange([]); }}><Trash2 />清空選取</Button> : null}</div>
    {notice ? <p className="comparison-datasheets-notice" role="status">{notice}</p> : null}
    {error ? <p id={`${id}-error`} className="comparison-datasheets-error" role="alert">{error}</p> : null}
    {value.length > 0 ? <details className="comparison-datasheets-selected" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary><ChevronDown aria-hidden="true" /><span>{expanded ? "收合" : "查看"}已選取的 {value.length} 份 PDF</span></summary>
      <ul className="comparison-datasheets-list">{value.map(file => <li className="comparison-datasheets-file" key={filePath(file).toLowerCase()}><span className="comparison-datasheets-path" title={filePath(file)}>{filePath(file)}</span><span className="comparison-datasheets-size">{formatBytes(file.size)}</span><Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`移除 ${filePath(file)}`} onClick={() => remove(file)}><X /></Button></li>)}</ul>
    </details> : null}
  </section>;
}
