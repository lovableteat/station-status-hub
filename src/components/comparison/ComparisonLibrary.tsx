import { useEffect, useRef, useState } from "react";
import { BookOpen, FileUp, Search, X, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { replaceWorkspaceHistory } from "@/lib/workspaceHistory";
import type { ComparisonRuntime } from "./runtime";
import type { InputFile } from "./types";
import { downloadLocal } from "./downloads";

export interface LibraryResult { entries: Record<string, unknown>[]; yaml: string; errors: string[]; warnings: string[]; }
interface DatasheetDraft { entry: Record<string, unknown>; entry_yaml: string; pages: number[]; notes: string[]; pageTexts?: { page: number; text: string }[]; }
function text(value: unknown) { return value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); }
export function ComparisonLibrary({ runtime, yaml, entries, onEntries, onSave, canEdit, signedBy, busy, runJob }: { runtime: ComparisonRuntime; yaml: string; entries: Record<string, unknown>[]; onEntries: (entries: Record<string, unknown>[]) => void; onSave: (yaml: string) => Promise<void>; canEdit: boolean; signedBy: string; busy: boolean; runJob: <T>(work: () => Promise<T>) => Promise<T | undefined> }) {
  const [editor, setEditor] = useState(yaml);
  const [draft, setDraft] = useState<DatasheetDraft | null>(null);
  const [candidate, setCandidate] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [mpn, setMpn] = useState("");
  const [who, setWho] = useState(signedBy);
  const [confirmed, setConfirmed] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("librarySearch") ?? "");
  const [verification, setVerification] = useState(() => { const value = new URLSearchParams(window.location.search).get("librarySigned"); return value === "signed" || value === "unsigned" ? value : "all"; });
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => setEditor(yaml), [yaml]);
  useEffect(() => { const restore = () => { const params = new URLSearchParams(window.location.search); setQuery(params.get("librarySearch") ?? ""); const value = params.get("librarySigned"); setVerification(value === "signed" || value === "unsigned" ? value : "all"); }; window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore); }, []);
  useEffect(() => { const url = new URL(window.location.href); if (query) url.searchParams.set("librarySearch", query); else url.searchParams.delete("librarySearch"); if (verification !== "all") url.searchParams.set("librarySigned", verification); else url.searchParams.delete("librarySigned"); if (url.href !== window.location.href) replaceWorkspaceHistory(url); }, [query, verification]);
  const validate = async (sign = false) => {
    setMessage(""); setIssues([]);
    const result = await runJob(() => runtime.request<LibraryResult>("library", { yaml: editor, ...(sign ? { entryYaml: candidate, signedBy: who } : {}) }));
    if (!result) return;
    setIssues([...result.errors, ...result.warnings]);
    if (result.errors.length) return;
    const saved = await runJob(async () => { await onSave(result.yaml); return true; });
    if (saved === undefined) return;
    onEntries(result.entries); setEditor(result.yaml); setMessage(sign ? "已簽核並儲存；下次比對使用這份位址庫" : "使用者位址庫已儲存");
  };
  const load = async () => { const result = await runJob(() => runtime.request<LibraryResult>("library", { yaml })); if (result) { onEntries(result.entries); setIssues([...result.errors, ...result.warnings]); } };
  const makeDraft = async () => {
    if (!pdf) return;
    setIssues([]); setDraft(null); setConfirmed(false);
    const result = await runJob(async () => {
      if (pdf.size > 64 * 1024 * 1024) throw new Error("Datasheet PDF 不可超過 64 MiB");
      const file: InputFile = { path: pdf.name, bytes: await pdf.arrayBuffer() };
      return runtime.request<DatasheetDraft>("datasheet", { file, name, mpn });
    });
    if (result) { setDraft(result); setCandidate(result.entry_yaml); setIssues(result.notes); }
  };
  const filtered = entries.filter(entry => (!query.trim() || Object.values(entry).map(text).join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && (verification === "all" || (verification === "signed" ? Boolean(entry.verified) : !entry.verified)));
  return <div className="comparison-library">
    <section className="comparison-section"><div className="comparison-section-heading"><div><h2><BookOpen />I²C 位址庫</h2><p>內建公開資料與你核對過的使用者規則；使用者庫優先套用。</p></div><Button variant="outline" onClick={() => void load()} disabled={busy}>載入／重新整理</Button></div><div className="comparison-filterbar"><label className="comparison-search"><Search /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋名稱、料號或出處" aria-label="搜尋位址庫" /></label><Select value={verification} onValueChange={setVerification}><SelectTrigger aria-label="位址規則驗證狀態"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部驗證狀態</SelectItem><SelectItem value="signed">已驗證</SelectItem><SelectItem value="unsigned">待核對</SelectItem></SelectContent></Select></div>{(query || verification !== "all") && <div className="comparison-filter-chips">{query && <Button variant="outline" size="sm" onClick={() => setQuery("")} aria-label="清除位址庫搜尋條件">搜尋：{query}<X /></Button>}{verification !== "all" && <Button variant="outline" size="sm" onClick={() => setVerification("all")} aria-label="清除位址庫驗證條件">狀態：{verification === "signed" ? "已驗證" : "待核對"}<X /></Button>}<Button variant="ghost" size="sm" onClick={() => { setQuery(""); setVerification("all"); }}>全部清除</Button></div>}<Table className="comparison-library-table"><TableHeader><TableRow><TableHead>名稱</TableHead><TableHead>料號規則</TableHead><TableHead>位址／類型</TableHead><TableHead>驗證</TableHead><TableHead>簽核／出處</TableHead></TableRow></TableHeader><TableBody>{filtered.map((entry, index) => <TableRow key={`${text(entry.name)}-${index}`}><TableCell><strong>{text(entry.name)}</strong><small>{text(entry.origin)}</small></TableCell><TableCell>{text(entry.mpn ?? entry.match ?? entry.part_regex)}</TableCell><TableCell>{entry.fixed !== undefined ? `固定 ${text(entry.fixed)}` : entry.base !== undefined ? `Base ${text(entry.base)}` : entry.table ? "位址對照表" : text(entry.kind) || "—"}</TableCell><TableCell><Badge variant="secondary">{entry.verified ? "已驗證" : "待核對"}</Badge></TableCell><TableCell>{text(entry.signed_by)} {text(entry.signed_date)}<small>{text(entry.source ?? entry.src)}</small></TableCell></TableRow>)}{!filtered.length && <TableRow><TableCell colSpan={5} className="comparison-empty-result">{entries.length ? "目前篩選條件沒有符合的位址規則" : "尚未載入位址庫，點選載入／重新整理"}</TableCell></TableRow>}</TableBody></Table></section>
    <section className="comparison-section"><div className="comparison-section-heading"><div><h2>Datasheet 候選規則</h2><p>上傳 PDF，逐列核對原文後簽核。候選內容不會自動生效。</p></div></div><div className="comparison-datasheet-inputs"><div><Label htmlFor="compare-datasheet">Datasheet PDF</Label><Input id="compare-datasheet" type="file" accept=".pdf" disabled={!canEdit || busy} onChange={event => { const file = event.target.files?.[0] ?? null; setPdf(file); setName(file?.name.replace(/\.pdf$/i, "") ?? ""); setDraft(null); }} /></div><div><Label htmlFor="compare-library-name">庫名稱</Label><Input id="compare-library-name" value={name} maxLength={120} disabled={!canEdit || busy} onChange={event => setName(event.target.value)} /></div><div><Label htmlFor="compare-library-mpn">料號 regex</Label><Input id="compare-library-mpn" value={mpn} maxLength={300} placeholder="例如 MP5926" disabled={!canEdit || busy} onChange={event => setMpn(event.target.value)} /></div><Button disabled={!pdf || !canEdit || busy} onClick={() => void makeDraft()}><FileUp />產生候選規則</Button></div>{draft && <><div className="comparison-draft-grid"><div><Label htmlFor="compare-entry-yaml">候選規則 YAML</Label><Textarea id="compare-entry-yaml" className="comparison-yaml" value={candidate} onChange={event => { setCandidate(event.target.value); setConfirmed(false); }} disabled={!canEdit || busy} /><p className="comparison-help">0 = GND、1 = VDD、Z = 浮接；SDA／SCL 表示接自己的訊號。</p></div><div className="comparison-datasheet-text"><h3>PDF 原文</h3>{draft.pageTexts?.map(item => <details key={item.page} open><summary>第 {item.page} 頁</summary><pre>{item.text}</pre></details>)}{!draft.pageTexts?.length && <p>未找到可確認的位址表，請核對 PDF 並補齊候選規則。</p>}</div></div><div className="comparison-signoff"><label><Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} disabled={!canEdit || busy} />我已對照 PDF 核對這份位址規則</label><Input aria-label="位址規則簽核人" value={who} onChange={event => setWho(event.target.value)} maxLength={120} disabled={!canEdit || busy} /><Button disabled={!canEdit || busy || !confirmed || !who.trim()} onClick={() => void validate(true)}><ShieldCheck />簽核並儲存</Button></div></>}</section>
    <details className="comparison-section"><summary>使用者位址庫 YAML／匯入匯出</summary><p className="comparison-help">可載入原 AutoCheck 的 i2c_devices_user.yaml；內建庫不會被覆寫。</p><Textarea aria-label="使用者位址庫 YAML" className="comparison-yaml" value={editor} onChange={event => setEditor(event.target.value)} disabled={!canEdit || busy} maxLength={2_000_000} /><input ref={upload} type="file" accept=".yaml,.yml" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void runJob(async () => { if (file.size > 2 * 1024 * 1024) throw new Error("位址庫不可超過 2 MiB"); setEditor(await file.text()); }); event.target.value = ""; }} /><div className="comparison-actions"><Button variant="outline" disabled={!canEdit || busy} onClick={() => upload.current?.click()}>匯入 YAML</Button><Button variant="outline" onClick={() => downloadLocal(yaml || "devices: []\n", "i2c_devices_user.yaml", "text/yaml")}><Download />匯出 YAML</Button><Button disabled={!canEdit || busy} onClick={() => void validate()}>驗證並儲存</Button></div></details>{!!issues.length && <div className="comparison-notice" role="status">{issues.map((issue, index) => <p key={index}>{issue}</p>)}</div>}{message && <p className="comparison-good" role="status">{message}</p>}
  </div>;
}
