import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, Pencil, Plus, RefreshCw, Save, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mergeVendorContacts, normalizeContactEmails, parseVendorContactRows, validateVendorContact, VENDOR_CONTACT_FIELD_LIMITS, type VendorContact, type VendorContactImportIssue } from "./vendorContacts";
import type { StoredVendorContact } from "./vendorContactsStorage";
import type { useVendorContacts } from "./useVendorContacts";

type ImportPreview = { fileName: string; contacts: VendorContact[]; issues: (VendorContactImportIssue & { sheetName: string })[] };
const contactFields = [
  { key: "vendor", label: "廠商", required: true },
  { key: "name", label: "聯絡人" },
  { key: "email", label: "收件人 Email", required: true },
  { key: "cc", label: "副本 Email" },
  { key: "phone", label: "電話" },
  { key: "note", label: "備註" },
] as const;
const messageOf = (error: unknown) => error instanceof Error ? error.message : "操作失敗，請重試。";

function decodeCsv(data: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    try {
      return new TextDecoder("big5", { fatal: true }).decode(data);
    } catch {
      throw new Error("CSV 編碼無法辨識；目前支援 UTF-8（含 BOM）與 Big5。此次尚未儲存任何資料。");
    }
  }
}

export function VendorContactsPanel({ book }: { book: ReturnType<typeof useVendorContacts> }) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<VendorContact | null>(null);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const formId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const disabled = !book.canEdit || book.loading || book.busy || parsing;
  const activeSearch = search.trim();
  const rows = useMemo(() => book.contacts.filter((contact) => !activeSearch || contactFields.some(({ key }) => contact[key].toLowerCase().includes(activeSearch.toLowerCase()))), [activeSearch, book.contacts]);
  const importMerge = useMemo(() => preview ? mergeVendorContacts(book.contacts, preview.contacts) : null, [book.contacts, preview]);

  function editContact(contact?: StoredVendorContact) {
    setDraft(contact ? { id: contact.id, vendor: contact.vendor, name: contact.name, email: contact.email, cc: contact.cc, phone: contact.phone, note: contact.note }
      : { id: crypto.randomUUID(), vendor: "", name: "", email: "", cc: "", phone: "", note: "" });
    setExpectedUpdatedAt(contact?.updatedAt);
    setFormError(null);
    setNotice(null);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || disabled) return;
    const errors = validateVendorContact(draft);
    if (errors.length) { setFormError(errors.join("；")); return; }
    setFormError(null);
    try {
      await book.save({ ...draft, vendor: draft.vendor.trim(), email: normalizeContactEmails(draft.email), cc: normalizeContactEmails(draft.cc) }, expectedUpdatedAt);
      if (mounted.current) { setDraft(null); setNotice("聯絡人已儲存至目前帳號。"); }
    } catch (error) {
      if (mounted.current) setFormError(messageOf(error));
    }
  }

  async function readContacts(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || disabled || draft) return;
    setFormError(null);
    setNotice(null);
    setPreview(null);
    try {
      const token = book.capture();
      if (!/\.(xlsx?|csv)$/i.test(file.name)) throw new Error("請選擇 Excel（.xlsx／.xls）或 CSV 聯絡清單。");
      if (file.size > 5 * 1024 * 1024) throw new Error("聯絡清單不可超過 5 MiB，請分開匯入。");
      setParsing(true);
      const data = await file.arrayBuffer();
      book.assertCurrent(token);
      const XLSX = await import("xlsx");
      book.assertCurrent(token);
      const type = /\.csv$/i.test(file.name) ? "string" : "array";
      const source = type === "string" ? decodeCsv(data) : data;
      const metadata = XLSX.read(source, { type, bookSheets: true, raw: true });
      if (metadata.SheetNames.length > 50) throw new Error("聯絡清單最多 50 張工作表，請分開匯入。此次尚未儲存任何資料。");
      if (!metadata.SheetNames.length) throw new Error("聯絡清單沒有可讀取的工作表。");
      const workbook = XLSX.read(source, { type, sheetRows: 10001, raw: true });
      const contacts: VendorContact[] = [];
      const issues: ImportPreview["issues"] = [];
      let dataRows = 0;
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const range = sheet["!fullref"] ?? sheet["!ref"];
        if (range && XLSX.utils.decode_range(range).e.c >= 256) throw new Error(`工作表「${sheetName}」最多 256 欄，請移除無關欄位後再匯入。此次尚未儲存任何資料。`);
        if (sheet["!fullref"] && XLSX.utils.decode_range(sheet["!fullref"]).e.r >= 10001) {
          throw new Error(`工作表「${sheetName}」超過 10000 列資料的讀取範圍，請分開匯入。此次尚未儲存任何資料。`);
        }
        const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true, range: 0 });
        const result = parseVendorContactRows(values);
        dataRows += result.contacts.length + result.issues.length;
        if (dataRows > 10000) throw new Error("聯絡清單合計最多 10000 列資料，請分開匯入。此次尚未儲存任何資料。");
        if (contacts.length + result.contacts.length > 5000) throw new Error("每次最多匯入 5000 筆聯絡人，請分開匯入。此次尚未儲存任何資料。");
        contacts.push(...result.contacts);
        issues.push(...result.issues.map((issue) => ({ ...issue, sheetName })));
      }
      book.assertCurrent(token);
      if (mounted.current) setPreview({ fileName: file.name, contacts, issues });
    } catch (error) {
      if (mounted.current) setFormError(messageOf(error));
    } finally {
      if (mounted.current) setParsing(false);
    }
  }

  async function confirmImport() {
    if (!preview || !importMerge || !importMerge.added || disabled) return;
    try {
      const result = await book.importContacts(importMerge.contacts.slice(book.contacts.length));
      if (mounted.current) {
        setNotice(`已匯入 ${result.added} 筆聯絡人；${importMerge.skipped + result.skipped} 筆重複資料未新增。`);
        setPreview(null);
      }
    } catch (error) {
      if (mounted.current) setFormError(messageOf(error));
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob(["\uFEFF廠商,聯絡人,Email,副本,電話,備註\r\n"], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "供應商聯絡清單_空白範本.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="min-w-0 space-y-4" aria-label="供應商聯絡簿">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">供應商聯絡簿</h3>
          <p className="text-sm text-muted-foreground">儲存在目前帳號，匯入後可逐筆修改；不會自動寄信。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-11" disabled={disabled || !!draft} onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4" />{parsing ? "正在讀取清單" : "匯入聯絡清單"}</Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled || !!draft} onClick={() => editContact()}><Plus className="h-4 w-4" />新增聯絡人</Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => { void book.reload().catch(() => {}); }}><RefreshCw className="h-4 w-4" />更新</Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={downloadTemplate}><Download className="h-4 w-4" />空白範本</Button>
        </div>
        <input ref={fileInput} type="file" className="hidden" accept=".xlsx,.xls,.csv" aria-label="選擇供應商聯絡清單" onChange={(event) => { void readContacts(event); }} />
      </div>
      <p className="text-sm text-muted-foreground">Excel／CSV 需含「廠商」及有效「Email」；多位收件人以分號、逗號或換行分隔。單檔上限 5 MiB，每次最多 5000 筆。</p>
      {!book.canEdit && <p role="alert" className="text-sm text-destructive">請登入正式帳號後使用個人雲端聯絡簿。</p>}
      {book.error && <p role="alert" className="text-sm text-destructive">{book.error}</p>}
      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}

      {draft && (
        <form className="space-y-3 rounded-lg border border-border bg-muted/20 p-4" onSubmit={(event) => { void saveDraft(event); }}>
          <h4 className="font-semibold">{expectedUpdatedAt ? "編輯聯絡人" : "新增聯絡人"}</h4>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {contactFields.map((field) => <div key={field.key} className={field.key === "note" ? "space-y-1.5 sm:col-span-2" : "min-w-0 space-y-1.5"}>
              <Label htmlFor={`${formId}-${field.key}`}>{field.label}{"required" in field && field.required ? " *" : ""}</Label>
              {field.key === "note" ? <Textarea id={`${formId}-${field.key}`} aria-label="聯絡人備註" rows={2} maxLength={VENDOR_CONTACT_FIELD_LIMITS[field.key]} value={draft.note} disabled={disabled}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
                : <Input id={`${formId}-${field.key}`} aria-label={field.key === "name" ? "聯絡人姓名" : field.label} className="min-h-11" value={draft[field.key]} maxLength={VENDOR_CONTACT_FIELD_LIMITS[field.key]} disabled={disabled}
                  required={"required" in field && field.required} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />}
            </div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11" disabled={disabled}><Save className="h-4 w-4" />{book.busy ? "儲存中" : "儲存聯絡人"}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={book.busy} onClick={() => { setDraft(null); setFormError(null); }}>取消編輯</Button>
          </div>
        </form>
      )}

      {preview && importMerge && (
        <div className="min-w-0 space-y-3 rounded-lg border border-border bg-muted/20 p-4" aria-label="聯絡清單匯入預覽">
          <h4 className="break-all font-semibold">匯入預覽：{preview.fileName}</h4>
          <p className="text-sm">{preview.contacts.length} 筆有效資料；預計新增 {importMerge.added} 筆、重複跳過 {importMerge.skipped} 筆。異常 {preview.issues.length} 列不會匯入，既有資料不會被覆蓋。</p>
          {preview.contacts.length > 0 && <>
            <p className="text-sm text-muted-foreground">以下預覽前 {Math.min(preview.contacts.length, 10)} 筆；確認後匯入全部不重複的有效聯絡人。</p>
            <Table><TableHeader><TableRow><TableHead>廠商</TableHead><TableHead>聯絡人</TableHead><TableHead>收件人 Email</TableHead><TableHead>副本 Email</TableHead><TableHead>電話</TableHead></TableRow></TableHeader>
              <TableBody>{preview.contacts.slice(0, 10).map((contact) => <TableRow key={contact.id}><TableCell>{contact.vendor}</TableCell><TableCell>{contact.name || "—"}</TableCell><TableCell className="break-all">{contact.email}</TableCell><TableCell className="break-all">{contact.cc || "—"}</TableCell><TableCell>{contact.phone || "—"}</TableCell></TableRow>)}</TableBody></Table>
          </>}
          {preview.issues.length > 0 && <div className="space-y-1 text-sm text-destructive" role="alert">
            <p>下列異常列不會匯入，請修正原檔後再重試：{preview.issues.length > 50 ? `（顯示前 50 列，共 ${preview.issues.length} 列）` : ""}</p>
            <ul className="max-h-40 overflow-auto pl-4">{preview.issues.slice(0, 50).map((issue, index) => <li key={index}>{issue.sheetName} 第 {issue.rowNumber} 列：{issue.message}</li>)}</ul>
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" disabled={disabled || !importMerge.added} onClick={() => { void confirmImport(); }}>{book.busy ? "匯入中" : `匯入 ${importMerge.added} 筆有效聯絡人`}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={book.busy} onClick={() => { setPreview(null); setFormError(null); }}>取消匯入</Button>
          </div>
        </div>
      )}

      <div className="space-y-2" aria-label="聯絡人搜尋與結果">
        <Label htmlFor={`${formId}-search`}>搜尋聯絡人</Label>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input id={`${formId}-search`} type="search" className="min-h-11 pl-9" aria-label="搜尋聯絡人" placeholder="搜尋廠商、姓名、Email、電話或備註" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {activeSearch && <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/30 bg-primary/10 pl-2 text-sm"><span className="break-all">搜尋：{activeSearch}</span><Button type="button" variant="ghost" className="h-11 w-11 shrink-0 p-0" aria-label="清除搜尋條件" onClick={() => setSearch("")}><X className="h-4 w-4" /></Button></span>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setSearch("")}>全部清除</Button>
        </div>}
        <Table>
          <TableHeader><TableRow><TableHead>廠商</TableHead><TableHead>聯絡人</TableHead><TableHead>收件人 Email</TableHead><TableHead>副本 Email</TableHead><TableHead>電話</TableHead><TableHead>備註</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
          <TableBody>{book.loading ? <TableRow><TableCell colSpan={7} className="h-20 text-center" role="status">正在載入聯絡簿</TableCell></TableRow>
            : rows.length === 0 ? <TableRow><TableCell colSpan={7} className="h-20 text-center text-muted-foreground">目前篩選條件沒有符合的聯絡人</TableCell></TableRow>
              : rows.map((contact) => <TableRow key={contact.id}>
                <TableCell className="min-w-28 font-medium">{contact.vendor}</TableCell><TableCell>{contact.name || "—"}</TableCell>
                <TableCell className="min-w-44 break-all">{contact.email}</TableCell><TableCell className="min-w-36 break-all">{contact.cc || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{contact.phone || "—"}</TableCell><TableCell className="min-w-32 max-w-xs break-words">{contact.note || "—"}</TableCell>
                <TableCell><Button type="button" variant="ghost" className="min-h-11" disabled={disabled || !!draft} aria-label={`編輯 ${contact.vendor} 聯絡人 ${contact.name || contact.email}`} onClick={() => editContact(contact)}><Pencil className="h-4 w-4" />編輯</Button></TableCell>
              </TableRow>)}</TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">顯示 {rows.length} ／ {book.contacts.length} 位聯絡人</p>
      </div>
    </section>
  );
}
