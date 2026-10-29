import { useMemo, useState } from 'react';
import { Copy, Factory, Pencil, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { SUPPLIER_FIELDS, emptySupplierData, supplierEmails, validateSupplierData, type SupplierContact, type SupplierField } from './supplierDirectory';
import { useCompanySuppliers } from './useCompanySuppliers';
import { SupplierImportPanel } from './SupplierImportPanel';
import { createSupplierContactMatcher, SUPPLIER_SEARCH_SCOPES, type SupplierSearchScope } from './supplierSearch';

export function SupplierDirectoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const book = useCompanySuppliers(open);
  return <Dialog open={open} onOpenChange={value => { if (!book.busy) onOpenChange(value); }}>
    <DialogContent data-testid="supplier-directory-dialog" className="flex h-[min(92dvh,960px)] w-[min(96vw,1600px)] max-w-[min(96vw,1600px)] flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <DialogHeader className="pr-12"><DialogTitle className="flex items-center gap-2"><Factory className="h-5 w-5 text-primary" />供應商聯絡資料</DialogTitle>
        <DialogDescription>公司帳號共用查詢 · {book.canEdit ? '管理員可匯入與修改' : '僅管理員可修改'}</DialogDescription></DialogHeader>
      {open && <DirectoryContent key={book.accountId ?? 'signed-out'} book={book} />}
    </DialogContent>
  </Dialog>;
}

function DirectoryContent({ book }: { book: ReturnType<typeof useCompanySuppliers> }) {
  const [query, setQuery] = useState(''), [source, setSource] = useState(''), [page, setPage] = useState(0);
  const [searchScope, setSearchScope] = useState<SupplierSearchScope>('company');
  const [selectedId, setSelectedId] = useState<string | null>(null), [draft, setDraft] = useState<SupplierContact | null>(null);
  const [importing, setImporting] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const sources = useMemo(() => [...new Set(book.contacts.map(x => x.source.group))].sort((a, b) => a.localeCompare(b, 'zh-TW')), [book.contacts]);
  const rows = useMemo(() => {
    const matches = createSupplierContactMatcher(query, searchScope);
    return book.contacts.filter(x => (!source || x.source.group === source) && matches(x))
      .sort((a, b) => a.data.company.localeCompare(b.data.company, 'zh-TW') || a.data.name.localeCompare(b.data.name, 'zh-TW'));
  }, [book.contacts, query, searchScope, source]);
  const selected = book.contacts.find(x => x.id === selectedId) ?? null;
  const displayed = book.canEdit && draft ? draft : selected;
  const editing = book.canEdit && !!draft;
  const pages = Math.max(1, Math.ceil(rows.length / 50)), currentPage = Math.min(page, pages - 1), visible = rows.slice(currentPage * 50, (currentPage + 1) * 50);
  const disabled = book.loading || book.busy;
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('已複製'); setError(''); }
    catch { setError('無法寫入剪貼簿，請選取文字自行複製'); }
  }
  function create() {
    const data = emptySupplierData();
    setDraft({ id: crypto.randomUUID(), version: 0, data, imported: { ...data }, source: { group: '手動新增', file: '', sheet: '', row: 0, slot: 1, raw: [] } }); setError('');
  }
  async function save() {
    if (!draft || !book.canEdit) return;
    const errors = validateSupplierData(draft.data);
    if (errors.length) { setError(errors.join('；')); return; }
    try {
      setError('');
      await book.save([{ ...draft, data: { ...draft.data, email: supplierEmails(draft.data.email).join('; '), cc: supplierEmails(draft.data.cc).join('; ') }, imported: draft.version ? draft.imported : draft.data }]);
      setDraft(null); setSelectedId(draft.id); setNotice('公司聯絡資料已儲存');
    } catch (e) { setError(e instanceof Error ? e.message : '儲存失敗'); }
  }
  function update(field: SupplierField, value: string) { setDraft(prior => prior ? { ...prior, data: { ...prior.data, [field]: value } } : prior); }

  if (importing && book.canEdit) return <SupplierImportPanel book={book} onBack={() => setImporting(false)} />;
  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
      <p className="text-sm text-muted-foreground"><strong className="text-foreground">{book.contacts.length.toLocaleString()}</strong> 筆窗口 · {sources.length} 個來源</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => void book.reload().catch(() => {})}><RefreshCw className="mr-1.5 h-4 w-4" />更新</Button>
        {book.canEdit && <><Button variant="outline" size="sm" disabled={disabled || !!draft} onClick={create}><Plus className="mr-1.5 h-4 w-4" />新增聯絡人</Button>
          <Button size="sm" disabled={disabled || !!draft} onClick={() => setImporting(true)}><Upload className="mr-1.5 h-4 w-4" />匯入與比較</Button></>}
      </div>
    </div>
    {!book.accountId && <p role="alert" className="text-warning">請使用公司帳號登入後查詢聯絡資料</p>}
    {(error || book.error) && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error || book.error}</p>}
    {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-2', displayed && 'hidden lg:flex')} aria-label="供應商查詢結果">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
          <div className="relative col-span-2 min-w-0 sm:col-span-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="h-10 pl-9" aria-label="搜尋供應商聯絡資料" placeholder={SUPPLIER_SEARCH_SCOPES[searchScope].placeholder} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></div>
          <select className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm" aria-label="搜尋範圍" value={searchScope} onChange={e => { setSearchScope(e.target.value as SupplierSearchScope); setPage(0); }}>
            {Object.entries(SUPPLIER_SEARCH_SCOPES).map(([value, scope]) => <option key={value} value={value}>{scope.label}</option>)}
          </select>
          <select className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm" aria-label="聯絡資料來源" value={source} onChange={e => { setSource(e.target.value); setPage(0); }}><option value="">全部來源</option>{sources.map(x => <option key={x} value={x}>{x}</option>)}</select>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">預設查公司／品牌，英文按完整字詞比對（ACES 不會命中 ACESCONN）。人名、Email、電話可切換搜尋範圍。</p>
        {(query || source || searchScope !== 'company') && <div className="flex flex-wrap gap-2">
          {query && <Button variant="secondary" size="sm" aria-label={`清除搜尋 ${query}`} onClick={() => setQuery('')}>搜尋：{query}<X className="ml-1 h-3 w-3" /></Button>}
          {searchScope !== 'company' && <Button variant="secondary" size="sm" aria-label="清除搜尋範圍條件" onClick={() => { setSearchScope('company'); setPage(0); }}>範圍：{SUPPLIER_SEARCH_SCOPES[searchScope].label}<X className="ml-1 h-3 w-3" /></Button>}
          {source && <Button variant="secondary" size="sm" aria-label={`清除來源 ${source}`} onClick={() => setSource('')}>來源：{source}<X className="ml-1 h-3 w-3" /></Button>}
          <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setSource(''); setSearchScope('company'); setPage(0); }}>全部清除</Button>
        </div>}
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border"><Table>
          <TableHeader className="sticky top-0 z-10 bg-secondary"><TableRow><TableHead className="min-w-44">公司／代理品牌</TableHead><TableHead className="min-w-32">聯絡人</TableHead><TableHead className="min-w-56">Email／電話</TableHead></TableRow></TableHeader>
          <TableBody>{visible.map(contact => <TableRow key={contact.id} data-testid="supplier-search-row" data-state={contact.id === selectedId ? 'selected' : undefined} className="align-top">
            <TableCell><button type="button" className="block max-w-80 whitespace-normal text-left font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setSelectedId(contact.id); setDraft(null); setError(''); }}>{contact.data.company}</button><p className="mt-1 max-w-72 whitespace-pre-line break-words text-xs text-muted-foreground">{contact.data.brands || contact.data.aliases}</p></TableCell>
            <TableCell className="max-w-56 whitespace-normal"><p>{contact.data.name || '未填姓名'}</p><p className="mt-1 text-xs text-muted-foreground">{contact.data.title || contact.data.department}</p></TableCell>
            <TableCell className="max-w-80 whitespace-normal"><p className="break-all text-sm">{contact.data.email || '未填有效 Email'}</p><p className="mt-1 text-xs text-muted-foreground">{contact.data.phone || contact.data.mobile}{contact.data.extension && ` 分機 ${contact.data.extension}`}</p></TableCell>
          </TableRow>)}{!visible.length && <TableRow><TableCell colSpan={3} className="py-12 text-center text-muted-foreground">{book.loading ? '正在載入公司聯絡資料…' : '目前篩選條件沒有符合的供應商聯絡資料'}</TableCell></TableRow>}</TableBody>
        </Table></div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{rows.length.toLocaleString()} 筆結果</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一頁</Button><span>{currentPage + 1} / {pages}</span><Button size="sm" variant="outline" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>下一頁</Button></div></div>
      </section>
      {displayed && <aside className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-primary/25 bg-background/40 lg:w-[min(42%,520px)] lg:flex-none" aria-label="供應商聯絡人詳情">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4"><div className="min-w-0"><h3 className="break-words font-semibold">{editing ? draft?.version ? '修改聯絡資料' : '新增聯絡人' : displayed.data.company}</h3>{!editing && <p className="mt-1 text-sm text-muted-foreground">{displayed.data.name || '未填姓名'}</p>}</div>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={book.busy} aria-label="關閉聯絡人詳情" onClick={() => { setSelectedId(null); setDraft(null); }}><X className="h-4 w-4" /></Button></div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {editing ? <form id="supplier-contact-form" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" onSubmit={e => { e.preventDefault(); void save(); }}>
            {(Object.keys(SUPPLIER_FIELDS) as SupplierField[]).map(field => <div key={field} className={['aliases','brands','note','address'].includes(field) ? 'sm:col-span-2 lg:col-span-1 xl:col-span-2' : ''}>
              <Label htmlFor={`supplier-field-${field}`} className="text-xs">{SUPPLIER_FIELDS[field]}{field === 'company' && ' *'}</Label>
              {['aliases','brands','note','address'].includes(field) ? <Textarea id={`supplier-field-${field}`} className="mt-1 min-h-20 text-sm" maxLength={6000} disabled={book.busy} value={displayed.data[field]} onChange={e => update(field, e.target.value)} /> : <Input id={`supplier-field-${field}`} className="mt-1 text-sm" required={field === 'company'} maxLength={6000} disabled={book.busy} value={displayed.data[field]} onChange={e => update(field, e.target.value)} />}
            </div>)}
          </form> : <dl className="space-y-4">{(Object.keys(SUPPLIER_FIELDS) as SupplierField[]).filter(field => displayed.data[field]).map(field => <div key={field} className="group">
            <dt className="flex items-center justify-between text-xs text-muted-foreground">{SUPPLIER_FIELDS[field]}<Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`複製${SUPPLIER_FIELDS[field]}`} onClick={() => void copy(displayed.data[field])}><Copy className="h-3.5 w-3.5" /></Button></dt><dd className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{displayed.data[field]}</dd>
          </div>)}</dl>}
          <details className="rounded-lg border border-border p-3 text-xs"><summary className="cursor-pointer text-muted-foreground">來源與原始欄位</summary><p className="mt-2 break-words">{displayed.source.group}<br />{displayed.source.file} / {displayed.source.sheet}{displayed.source.row ? ` 第 ${displayed.source.row} 列` : ''}</p><dl className="mt-3 space-y-2">{displayed.source.raw.map((field, i) => <div key={i}><dt className="text-muted-foreground">{field.label}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words">{field.value}</dd></div>)}</dl></details>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-3">{editing ? <><Button type="button" variant="outline" disabled={book.busy} onClick={() => setDraft(null)}>取消</Button><Button key="save" type="submit" form="supplier-contact-form" disabled={book.busy}>{book.busy ? '儲存中…' : '儲存'}</Button></> : <><Button type="button" variant="outline" onClick={() => void copy((Object.keys(SUPPLIER_FIELDS) as SupplierField[]).filter(f => displayed.data[f]).map(f => `${SUPPLIER_FIELDS[f]}：${displayed.data[f]}`).join('\n'))}><Copy className="mr-1.5 h-4 w-4" />複製完整資料</Button>{book.canEdit && <Button key="edit" type="button" disabled={disabled} onClick={() => { setDraft(structuredClone(displayed)); setError(''); }}><Pencil className="mr-1.5 h-4 w-4" />修改</Button>}</>}</div>
      </aside>}
    </div>
  </div>;
}
