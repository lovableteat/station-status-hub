import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SUPPLIER_COLUMNS, SUPPLIER_FIELDS, changedSupplierFields, diffSupplierImport, parseSupplierSheet, detectSupplierMapping, supplierImportChange, type SupplierColumn, type SupplierDiff } from './supplierDirectory';
import { readSupplierWorkbooks, type ImportSheet } from './supplierWorkbook';
import { loadSupplierGeminiTargets, reviewSupplierImport, type SupplierGeminiTarget } from './supplierGeminiReview';
import type { useCompanySuppliers } from './useCompanySuppliers';

const kinds = { added: '新增', changed: '變更', conflict: '人工修改衝突', ambiguous: '對應不明', unchanged: '未變更', missing: '本次缺少' };
const selectClass = 'h-10 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground';
const messageOf = (e: unknown) => e instanceof Error ? e.message : '操作失敗，請重試';

export function SupplierImportPanel({ book, onBack }: { book: ReturnType<typeof useCompanySuppliers>; onBack: () => void }) {
  const [sheets, setSheets] = useState<ImportSheet[]>([]), [reading, setReading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()), [resolved, setResolved] = useState<Record<string, string>>({});
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(0);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [aiOpen, setAiOpen] = useState(false), [targets, setTargets] = useState<SupplierGeminiTarget[]>([]), [targetId, setTargetId] = useState('');
  const [consent, setConsent] = useState(false), [aiBusy, setAiBusy] = useState(false), [aiText, setAiText] = useState('');
  const input = useRef<HTMLInputElement>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const parsed = useMemo(() => sheets.filter(x => x.enabled).map(sheet => ({ sheet, ...parseSupplierSheet(sheet, sheet.mapping) })), [sheets]);
  const incoming = useMemo(() => parsed.flatMap(x => x.contacts), [parsed]);
  const baseDiff = useMemo(() => diffSupplierImport(book.contacts, incoming, [...new Set(sheets.filter(x => x.enabled).map(x => x.group))]), [book.contacts, incoming, sheets]);
  const diffs = useMemo(() => baseDiff.map(diff => {
    const resolution = resolved[diff.key];
    if (diff.kind !== 'ambiguous' || !resolution) return diff;
    if (resolution === 'new') return { ...diff, kind: 'added' as const };
    const existing = book.contacts.find(x => x.id === resolution);
    if (!existing || !diff.incoming) return diff;
    const fields = changedSupplierFields(existing, diff.incoming);
    return { ...diff, existing, fields, rawChanged: JSON.stringify(existing.source.raw) !== JSON.stringify(diff.incoming.source.raw), kind: 'conflict' as const };
  }), [baseDiff, resolved, book.contacts]);
  useEffect(() => {
    setSelected(new Set(baseDiff.filter(x => x.kind === 'added' || x.kind === 'changed').map(x => x.key)));
    setResolved({}); setAiText(''); setConsent(false); setPage(0);
  }, [baseDiff]);
  useEffect(() => { setConsent(false); setAiText(''); }, [selected, resolved]);
  const filtered = diffs.filter(x => (!status || x.kind === status) && (!query.trim() || JSON.stringify([x.incoming?.data, x.existing?.data]).toLowerCase().includes(query.trim().toLowerCase())));
  const lastPage = Math.max(0, Math.ceil(filtered.length / 50) - 1), currentPage = Math.min(page, lastPage), visible = filtered.slice(currentPage * 50, (currentPage + 1) * 50);
  const applicable = (x: SupplierDiff) => ['added', 'changed', 'conflict'].includes(x.kind);
  const chosen = diffs.filter(x => selected.has(x.key) && applicable(x));
  const reviewChosen = diffs.filter(x => selected.has(x.key) && x.incoming);
  const disabled = book.busy || reading || aiBusy || !book.canEdit;
  const counts = Object.keys(kinds).map(kind => `${kinds[kind as keyof typeof kinds]} ${diffs.filter(x => x.kind === kind).length}`).join(' · ');
  const issues = parsed.flatMap(x => x.issues.map(issue => ({ ...issue, file: x.sheet.file, sheet: x.sheet.sheet })));
  const groups = [...new Set(book.contacts.map(x => x.source.group))];
  const aiPayload = JSON.stringify({ mappings: sheets.map(x => ({ enabled: x.enabled, sheet: x.sheet, headers: x.rows[x.mapping.header], columns: x.mapping.columns })),
    changes: reviewChosen.map(x => ({ kind: x.kind, before: x.existing?.data, candidates: x.candidates?.map(candidate => candidate.data), after: x.incoming?.data, fields: x.fields,
      rawBefore: x.rawChanged ? x.existing?.source.raw : undefined, rawAfter: x.rawChanged ? x.incoming?.source.raw : undefined })) });
  const latestAiPayload = useRef(aiPayload); latestAiPayload.current = aiPayload;

  async function read(files: File[]) {
    try {
      const token = book.capture(); setReading(true); setError(''); setNotice('');
      const result = await readSupplierWorkbooks(files); book.assertCurrent(token);
      if (mounted.current) setSheets(result);
    } catch (e) { if (mounted.current) setError(messageOf(e)); }
    finally { if (mounted.current) setReading(false); }
  }
  async function apply() {
    try {
      setError('');
      await book.save(chosen.map(supplierImportChange));
      if (mounted.current) { setSheets([]); setNotice(`已套用 ${chosen.length} 筆公司聯絡資料`); }
    } catch (e) { if (mounted.current) setError(messageOf(e)); }
  }
  async function openAi() {
    setAiOpen(true); setError('');
    try {
      const token = book.capture(); const result = await loadSupplierGeminiTargets(); book.assertCurrent(token);
      if (mounted.current) { setTargets(result); setTargetId(result[0]?.id ?? ''); }
    } catch (e) { if (mounted.current) setError(messageOf(e)); }
  }
  async function checkAi() {
    const target = targets.find(x => x.id === targetId);
    if (!target || !consent || reviewChosen.length > 100) return;
    try {
      const token = book.capture(); setAiBusy(true); setError('');
      const result = await reviewSupplierImport(target, aiPayload); book.assertCurrent(token);
      if (mounted.current && latestAiPayload.current === aiPayload) setAiText(result);
    } catch (e) { if (mounted.current) setError(messageOf(e)); }
    finally { if (mounted.current) setAiBusy(false); }
  }
  function toggle(key: string, checked: boolean) { setSelected(prior => { const next = new Set(prior); if (checked) next.add(key); else next.delete(key); return next; }); }

  return <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="supplier-import-panel">
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
      <Button variant="outline" onClick={onBack} disabled={disabled}>返回聯絡資料</Button>
      <Button onClick={() => input.current?.click()} disabled={disabled}>{reading ? '讀取中…' : sheets.length ? '重新選擇 Excel' : '選擇 Excel／CSV'}</Button>
      <input ref={input} type="file" multiple accept=".xlsx,.xls,.csv" aria-label="匯入公司供應商 Excel" className="sr-only" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void read(files); }} />
      <p className="text-sm text-muted-foreground">先核對欄位與差異，再儲存。未勾選的項目與本次缺少的資料均保留。</p>
    </div>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-primary">{notice}</p>}
    {!sheets.length ? <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
      <h3 className="text-lg font-semibold">匯入供應商聯絡清單</h3><p className="max-w-lg text-sm leading-6 text-muted-foreground">支援多份檔案及多張工作表。更新時選擇既有來源群組即可比較，檔名與欄位順序可不同；原始欄位會一起保留。</p>
    </div> : <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      <section className="rounded-xl border border-border bg-secondary/30 p-4">
        <h3 className="font-semibold">1. 核對來源與欄位</h3>
        <p className="mt-1 text-sm text-muted-foreground">更新檔請指定原來源群組。無法辨識的工作表預設略過，可展開自行對應。</p>
        <datalist id="supplier-source-groups">{groups.map(x => <option key={x} value={x} />)}</datalist>
        {[...new Set(sheets.map(x => x.file))].map(file => <div key={file} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,1fr)]">
          <span className="self-center truncate text-sm" title={file}>{file}</span>
          <label className="flex items-center gap-2 text-sm">來源群組<Input list="supplier-source-groups" value={sheets.find(x => x.file === file)?.group ?? ''} maxLength={200} disabled={disabled} aria-label={`${file} 來源群組`} onChange={e => setSheets(prior => prior.map(x => x.file === file ? { ...x, group: e.target.value } : x))} /></label>
        </div>)}
        <div className="mt-3 divide-y divide-border">
          {sheets.map((sheet, index) => <details key={`${sheet.file}:${sheet.sheet}`} className="py-2">
            <summary className="cursor-pointer text-sm"><span className={sheet.enabled ? 'text-primary' : 'text-warning'}>{sheet.enabled ? '納入' : '略過'}</span> · {sheet.file} / {sheet.sheet} · 表頭第 {sheet.mapping.header + 1} 列</summary>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sheet.enabled} disabled={disabled} onChange={e => setSheets(prior => prior.map((x, i) => i === index ? { ...x, enabled: e.target.checked } : x))} />納入此工作表</label>
              <label className="flex items-center gap-2 text-sm">表頭列<Input type="number" min={1} max={Math.max(1, sheet.rows.length)} className="w-24" value={sheet.mapping.header + 1} disabled={disabled} onChange={e => {
                const header = Math.max(0, Math.min(sheet.rows.length - 1, Number(e.target.value) - 1));
                setSheets(prior => prior.map((x, i) => i === index ? { ...x, mapping: { header, columns: detectSupplierMapping([x.rows[header] ?? []]).columns } } : x));
              }} /></label>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(sheet.rows[sheet.mapping.header] ?? []).map((header, column) => !header && !sheet.rows.slice(sheet.mapping.header + 1).some(row => row[column]) ? null : <label key={column} className="flex min-w-0 items-center gap-2 text-xs">
                <span className="w-2/5 truncate" title={String(header)}>{column + 1}. {String(header || '無表頭')}</span>
                <select className={`${selectClass} flex-1`} aria-label={`${sheet.sheet} 第 ${column + 1} 欄對應`} value={sheet.mapping.columns[column] ?? ''} disabled={disabled} onChange={e => setSheets(prior => prior.map((x, i) => {
                  if (i !== index) return x;
                  const columns = [...x.mapping.columns]; columns[column] = e.target.value as SupplierColumn;
                  return { ...x, mapping: { ...x.mapping, columns } };
                }))}>{Object.entries(SUPPLIER_COLUMNS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </label>)}
            </div>
          </details>)}
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-semibold">2. 選擇要套用的差異</h3><p className="mt-1 text-sm text-muted-foreground">{counts}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => setSelected(new Set(diffs.filter(x => ['added', 'changed'].includes(x.kind)).map(x => x.key)))}>選取無衝突項目</Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => setSelected(new Set(visible.filter(x => x.incoming && x.kind !== 'unchanged').map(x => x.key)))}>僅選本頁</Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => setSelected(new Set())}>清除選取</Button>
        </div>
      </div>
      <section className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-48 flex-1" placeholder="搜尋差異中的公司、聯絡人或 Email" aria-label="搜尋匯入差異" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />
          <select className={selectClass} aria-label="差異狀態" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">全部狀態</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        {(query || status) && <div className="flex flex-wrap gap-2 text-sm">
          {query && <Button variant="secondary" size="sm" onClick={() => setQuery('')}>搜尋：{query} ×</Button>}
          {status && <Button variant="secondary" size="sm" onClick={() => setStatus('')}>狀態：{kinds[status as keyof typeof kinds]} ×</Button>}
          <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setStatus(''); }}>全部清除</Button>
        </div>}
        <div className="overflow-x-auto rounded-xl border border-border"><Table>
          <TableHeader><TableRow><TableHead className="w-16">套用</TableHead><TableHead className="w-28">差異</TableHead><TableHead>公司／聯絡人</TableHead><TableHead>變更內容</TableHead></TableRow></TableHeader>
          <TableBody>{visible.map(diff => {
            const contact = diff.incoming ?? diff.existing!;
            return <TableRow key={diff.key} className={diff.kind === 'conflict' || diff.kind === 'ambiguous' ? 'bg-warning/5' : ''}>
              <TableCell>{(applicable(diff) || diff.kind === 'ambiguous') && <input type="checkbox" className="h-4 w-4 accent-primary" checked={selected.has(diff.key)} disabled={disabled} aria-label={`${diff.kind === 'ambiguous' ? '僅選取給 Gemini 檢查' : '套用'} ${contact.data.company} ${contact.data.name}${diff.kind === 'conflict' ? '，覆蓋衝突欄位' : ''}`} onChange={e => toggle(diff.key, e.target.checked)} />}</TableCell>
              <TableCell className={diff.kind === 'conflict' || diff.kind === 'ambiguous' ? 'text-warning' : diff.kind === 'added' ? 'text-primary' : 'text-muted-foreground'}>{kinds[diff.kind]}</TableCell>
              <TableCell><strong>{contact.data.company}</strong><p className="text-sm">{contact.data.name || '未填聯絡人'}{contact.data.title && ` · ${contact.data.title}`}</p><p className="break-all text-xs text-muted-foreground">{contact.source.sheet} · 第 {contact.source.row} 列</p></TableCell>
              <TableCell className="max-w-xl whitespace-normal text-sm">
                {diff.kind === 'ambiguous' ? <label>選擇對應聯絡人（未解決只可交 Gemini 檢查）<select className={`${selectClass} mt-1 w-full`} value={resolved[diff.key] ?? ''} onChange={e => { toggle(diff.key, false); setResolved(prior => ({ ...prior, [diff.key]: e.target.value })); }} disabled={disabled}>
                  <option value="">請選擇，未選不會儲存</option><option value="new">另存為新聯絡人</option>{diff.candidates?.map(x => <option key={x.id} value={x.id}>{x.data.company} / {x.data.name} / {x.data.email} / {x.source.sheet} 第{x.source.row}列</option>)}
                </select></label> : diff.fields.length ? <dl className="space-y-2">{diff.fields.map(field => <div key={field}>
                  <dt className="font-medium">{SUPPLIER_FIELDS[field]}</dt><dd className="break-words text-muted-foreground">目前：{diff.existing?.data[field] || '（空白）'}</dd><dd className="break-words text-primary">匯入：{diff.incoming?.data[field] || '（空白）'}</dd>
                </div>)}</dl> : diff.kind === 'added' ? <span className="break-all">{contact.data.email || '未填有效 Email，仍保留此窗口'}{contact.data.brands && ` · ${contact.data.brands}`}</span> : diff.kind === 'missing' ? '原資料保留，不會刪除' : diff.rawChanged ? '原始欄位或格式有變更' : '保留目前資料與人工修改'}
                {diff.rawChanged && <details className="mt-2"><summary className="cursor-pointer text-primary">原始欄位前後值</summary><div className="mt-2 grid gap-3 sm:grid-cols-2"><div><strong>目前來源</strong>{diff.existing?.source.raw.map((field, i) => <p key={i} className="break-words">{field.label}：{field.value}</p>)}</div><div><strong>匯入來源</strong>{diff.incoming?.source.raw.map((field, i) => <p key={i} className="break-words">{field.label}：{field.value}</p>)}</div></div></details>}
              </TableCell>
            </TableRow>;
          })}{!visible.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">目前篩選條件沒有符合的匯入差異</TableCell></TableRow>}</TableBody>
        </Table></div>
        <div className="flex items-center justify-between text-sm"><span>{filtered.length} 筆差異</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一頁</Button>{currentPage + 1} / {lastPage + 1}<Button variant="outline" size="sm" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>下一頁</Button></div></div>
      </section>
      <details className="rounded-lg border border-warning/30 p-3 text-sm"><summary className="cursor-pointer">核對提醒 {issues.length} 筆 · 略過 {sheets.filter(x => !x.enabled).length} 張工作表</summary><ul className="mt-2 max-h-60 space-y-1 overflow-auto text-muted-foreground">{issues.map((x, i) => <li key={i}>{x.file} / {x.sheet} 第{x.row}列：{x.message}</li>)}{sheets.filter(x => !x.enabled).map(x => <li key={`${x.file}:${x.sheet}`}>{x.file} / {x.sheet}：整張略過，未匯入</li>)}</ul></details>
      {aiOpen && <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <h3 className="font-semibold">Gemini 支援檢查</h3><p className="text-sm text-muted-foreground">只提供建議，不會自動修改或套用資料。可只檢查表頭，或加上勾選的最多 100 筆差異（含對應不明的項目）；另受 100000 字限制。</p>
        {!targets.length ? <p className="text-sm text-warning">沒有可用的 Google Gemini 金鑰，請管理員到 API 管理設定。</p> : <><Label htmlFor="supplier-gemini-model">使用模型</Label><select id="supplier-gemini-model" className={`${selectClass} block max-w-full`} value={targetId} disabled={aiBusy} onChange={e => { setTargetId(e.target.value); setConsent(false); }}>{targets.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" checked={consent} disabled={aiBusy} onChange={e => setConsent(e.target.checked)} />我同意將目前勾選 {reviewChosen.length} 筆的公司、聯絡人、Email、電話等變更前後、原始欄位及候選資料，連同表頭對應與工作表資訊傳給 Google Gemini（generativelanguage.googleapis.com）進行核對。</label>
          <Button disabled={disabled || !consent || reviewChosen.length > 100 || aiPayload.length > 100000} onClick={() => void checkAi()}>{aiBusy ? 'Gemini 檢查中…' : '送出檢查'}</Button>
        </>}
        {aiText && <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm leading-6">{aiText}</p>}
      </section>}
    </div>}
    {!!sheets.length && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <Button variant="outline" disabled={disabled} onClick={() => void openAi()}>Gemini 支援檢查</Button>
      <Button disabled={disabled || !chosen.length || chosen.some(x => !x.incoming?.source.group.trim())} onClick={() => void apply()}>{book.busy ? '儲存中…' : `套用已選 ${chosen.length} 筆`}</Button>
    </div>}
  </div>;
}
