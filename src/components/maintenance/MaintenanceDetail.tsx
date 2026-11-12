import { useMaintenanceComposer } from './useMaintenanceComposer';
import { PrivateAttachmentHtml } from "@/components/attachments/PrivateAttachmentHtml";
import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { ArrowLeft, Check, CheckCircle2, ChevronDown, Pencil, Pin, Send, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { FAULT_STATUSES, assetLabel, faultStatusLabel, getFaultStatus, ownerNames, type Fault, type FaultMessage, type FaultWorkspaceData } from './maintenanceModel';
import { AttachmentGallery, FilePicker, useComposerFilePreviews } from './MaintenanceAttachments';
import { MaintenanceLoading, MaintenanceSpinner, showMaintenanceSuccess } from './MaintenanceFeedback';
import { maintenanceError, updateFault, useFaultThread, useMaintenanceViewport } from './useMaintenanceData';

function eventText(message: FaultMessage) {
  const m = message.metadata;
  if (message.kind === 'created') return `建立報修：${message.body}`;
  if (message.kind === 'status') return `狀態 → ${faultStatusLabel(String(m.status))}`;
  if (message.kind === 'assignees') return `負責人：${m.previous_assignees || '未分派'} → ${m.assignees || '未分派'}`;
  if (message.kind === 'handover') return m.handover_message_id ? '設定交接重點' : '取消交接重點';
  return `更新資料${m.previous_title !== m.title ? ` · 名稱：${m.previous_title} → ${m.title}` : ''}${m.asset_changed ? ` · 機台：${m.previous_asset || '未記錄'} → ${m.asset || '未記錄'}` : ''}${m.previous_category !== m.category ? ` · 分類：${m.previous_category || '未分類'} → ${m.category || '未分類'}` : ''}`;
}
const timestamp = (value: string) => new Date(value).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function MaintenanceDetail({ actorId, projectId, issue, data, canEdit, onBack, refresh, assignmentRequest, onAssignmentHandled }: { actorId?: string; projectId: string; issue: Fault; data: FaultWorkspaceData; canEdit: boolean; onBack: () => void; refresh: () => Promise<void>; assignmentRequest?: { issueId: string }; onAssignmentHandled?: () => void }) {
  const { thread, loading, error: threadError, refresh: refreshThread } = useFaultThread(issue);
  const [modal, setModal] = useState<'assign' | 'resolve' | 'edit'>('edit');
  const [modalOpen, setModalOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(!issue.maintenance_status);
  const [owners, setOwners] = useState<string[]>([]), [peopleQuery, setPeopleQuery] = useState('');
  const [category, setCategory] = useState(issue.category || '');
  const [title, setTitle] = useState(issue.title), [asset, setAsset] = useState(assetLabel(issue));
  const composer = useMaintenanceComposer(actorId, projectId, issue.id, canEdit);
  const { text, savedNote } = composer.draft;
  const setText = composer.setText;
  const [pending, setPending] = useState<'note' | 'update' | 'refresh' | null>(null), [error, setError] = useState('');
  const busy = pending !== null || ['sending', 'checking'].includes(composer.draft.phase);
  const composerDisabled = busy || composer.blocked;
  const [version, setVersion] = useState(issue.updated_at);
  const files = useComposerFilePreviews(composer.draft.files, composer.setFiles), status = getFaultStatus(issue);
  const viewport = useMaintenanceViewport();
  useEffect(() => {
    const dirty = !!text.trim() || files.files.length > 0;
    const guard = (event: Event) => { if (busy || (dirty && !window.confirm('尚有未送出的紀錄或附件，離開後僅保留於本頁記憶體，重新整理或登出將遺失。確定離開？'))) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('workspace-before-navigate', guard); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('workspace-before-navigate', guard); window.removeEventListener('beforeunload', unload); };
  }, [text, files.files.length, busy]);
  const pin = thread.messages.find(message => message.id === issue.handover_message_id);
  const mutate = async (changes: Parameters<typeof updateFault>[1], success: string, expected = issue.updated_at) => {
    if (busy) return;
    setPending('update'); setError('');
    try { await updateFault({ ...issue, updated_at: expected }, changes); setPending('refresh'); setModalOpen(false); showMaintenanceSuccess(success); await refresh(); await refreshThread(); }
    catch (cause) { setError(maintenanceError(cause)); await refresh(); if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'PT409' && 'details' in cause) setVersion(String(cause.details)); }
    finally { setPending(null); }
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || (!text.trim() && !files.files.length)) return;
    setError('');
    try {
      if (await composer.send()) {
        if (composer.isCurrent()) showMaintenanceSuccess('處理紀錄已送出');
      }
    } finally {
      if (composer.isCurrent()) { await refresh(); await refreshThread(); }
    }
  };
  const openModal = (type: typeof modal) => { setModal(type); setModalOpen(true); setVersion(issue.updated_at); setError(''); };
  const openAssign = () => { setOwners((issue.assignee_user_ids || []).filter(id => data.people.some(person => person.id === id))); setPeopleQuery(''); openModal('assign'); };
  useEffect(() => { if (assignmentRequest?.issueId === issue.id && canEdit) { openAssign(); onAssignmentHandled?.(); } }, [assignmentRequest]);
  const openEdit = () => { setTitle(issue.title); setAsset(assetLabel(issue)); openModal('edit'); };
  return <section className="mf-detail" data-keyboard={viewport.bottom > 100} style={{ '--mf-keyboard-gap': `${viewport.bottom}px` } as React.CSSProperties} aria-label="故障詳情">
    <header className="mf-detail-head"><Button variant="ghost" className="mf-back" onClick={onBack}><ArrowLeft size={17}/>返回清單</Button><span className={`mf-status ${status}`}>{faultStatusLabel(status)}</span><Button variant="ghost" aria-label="關閉故障詳情" title="關閉故障詳情" className="mf-detail-close" onClick={onBack}><X size={18}/></Button></header>
    <div className="mf-detail-scroll">
      <div className="mf-detail-title">
        <div className="mf-detail-identity"><p className="mf-eyebrow">{assetLabel(issue)}</p>{canEdit && <Button variant="outline" size="sm" className="mf-detail-edit" disabled={busy} onClick={openEdit}><Pencil size={14}/>編輯</Button>}</div>
        <h2>{issue.title}</h2>
        <div className="mf-detail-meta"><span>建立 {timestamp(issue.created_at)}</span>{issue.category && <span>{issue.category}</span>}{!issue.maintenance_status && <span>原狀態：{issue.status === 'closed' ? '已關閉' : faultStatusLabel(status)}</span>}</div>
      </div>
      <div className="mf-detail-controls"><button type="button" disabled={!canEdit || busy} onClick={openAssign}><UserRound size={16}/><span>{ownerNames(issue, data.people).join('、') || (canEdit ? '指派負責人' : '未分派')}</span></button>
        {canEdit && (status === 'resolved' ? <Button variant="outline" disabled={busy} onClick={() => void mutate({ maintenance_status: 'pending' }, '故障已重新開啟')}>重新開啟</Button> : <><label className="mf-select"><select aria-label="更新故障狀態" title="更新故障狀態" value={status} disabled={busy} onChange={event => void mutate({ maintenance_status: event.target.value }, '故障狀態已更新')}>{FAULT_STATUSES.filter(item => item.value !== 'resolved').map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={14} aria-hidden="true"/></label><Button disabled={busy} onClick={() => { setCategory(issue.category || ''); openModal('resolve'); }}><CheckCircle2 size={16}/>解決</Button></>)}
      </div>
      {pending === 'update' && !modalOpen && <MaintenanceLoading label="更新故障中…" />}
      {pin && <div className="mf-handover"><div><Pin size={15}/><strong>交接重點</strong>{canEdit && <button type="button" disabled={busy} onClick={() => void mutate({ handover_message_id: null }, '已取消置頂')}>取消置頂</button>}</div><p>{pin.body || '查看附件'}</p><AttachmentGallery attachments={thread.attachments.filter(file => file.maintenance_message_id === pin.id)}/></div>}
      {((!loading && !thread.messages.some(message => message.kind === 'created')) || issue.description !== issue.title || issue.process_notes || issue.solution || thread.attachments.some(file => !file.maintenance_message_id)) && <details className="mf-legacy" open={legacyOpen} onToggle={event => setLegacyOpen(event.currentTarget.open)}><summary>原始問題與處理紀錄</summary>{issue.priority && <p className="mf-hint">原優先級：{({critical:"緊急",high:"高",medium:"中",low:"低"} as Record<string,string>)[issue.priority] || issue.priority}</p>}{issue.tags?.length ? <p className="mf-hint">原標籤：{issue.tags.join("、")}</p> : null}{issue.relate && <p className="mf-hint">原關聯資料：{issue.relate}</p>}{[['問題描述', issue.description !== issue.title ? issue.description : ''], ['處理說明', issue.process_notes], ['解決方式', issue.solution]].map(([label, body]) => body ? <div key={label}><h4>{label}</h4><PrivateAttachmentHtml className="mf-rich-text" html={DOMPurify.sanitize(body)}/></div> : null)}<AttachmentGallery attachments={thread.attachments.filter(file => !file.maintenance_message_id)}/></details>}
      <div className="mf-timeline-heading"><h3>處理紀錄</h3><span>{loading || threadError ? '—' : `${thread.messages.length} 則`}</span></div>
      {loading && <MaintenanceLoading label="讀取處理紀錄…" />}
      {threadError && <p role="alert" className="mf-error">{threadError}<button onClick={() => void refreshThread()}>重試</button></p>}
      {!loading && !threadError && !thread.messages.length && <p className="mf-hint mf-timeline-empty">從這裡補上處理進度，接手的人就能直接查看。</p>}
      <ol className="mf-timeline" data-ready={!loading && !threadError}>{thread.messages.map(message => <li key={message.id} className={message.kind === 'note' ? 'mf-note' : 'mf-event'}><div className="mf-message-meta"><strong>{message.actor_name}</strong><time dateTime={message.created_at}>{timestamp(message.created_at)}</time>{message.kind === 'note' && canEdit && <button type="button" title="設為交接重點" aria-label={`置頂 ${message.body || '附件'}`} disabled={busy} onClick={() => void mutate({ handover_message_id: message.id }, '交接重點已置頂')}><Pin size={14}/></button>}</div>{message.kind === 'note' ? <><p>{message.body}</p><AttachmentGallery attachments={thread.attachments.filter(file => file.maintenance_message_id === message.id)}/></> : <p>{eventText(message)}</p>}</li>)}</ol>
    </div>
    {canEdit ? <form className="mf-composer" onSubmit={send} onPaste={event => { if (!composerDisabled && !composer.draft.attemptLocked && event.clipboardData.files.length) { event.preventDefault(); files.add(event.clipboardData.files); } }}>
      {(error || composer.draft.error) && !modalOpen && <p role="alert" className="mf-error">{error || composer.draft.error}</p>}{composer.draft.phase === 'uncertain' && <Button type="button" variant="outline" onClick={() => void composer.reconcile()}>核對送出結果</Button>}{composer.draft.phase === 'checking' && <p role="status">核對送出結果中…</p>}{composer.draft.attemptLocked && composer.draft.phase === 'idle' && <p className="mf-hint">原送出文字與附件保持不變，可手動重試確認；不會自動送出。</p>}<label htmlFor="mf-new-note" className="mf-composer-label">新增處理紀錄</label><Textarea id="mf-new-note" value={text} disabled={composerDisabled || savedNote || composer.draft.attemptLocked} maxLength={20000} rows={2} placeholder="做了什麼、發現什麼、下一步…" onChange={event => setText(event.target.value)}/><div className="mf-composer-tools"><FilePicker state={files} disabled={composerDisabled || composer.draft.attemptLocked}/><Button className="mf-submit" type="submit" disabled={composerDisabled || (!text.trim() && !files.files.length)} aria-busy={composer.draft.phase === 'sending' || undefined}>{composer.draft.phase === 'sending' ? <MaintenanceSpinner /> : <Send size={16}/>} {composer.draft.phase === 'sending' ? '送出中…' : savedNote ? '重試附件' : '送出'}</Button></div>
    </form> : <p className="mf-readonly">{status === 'resolved' ? '已解決 · ' : ''}目前為唯讀，原始紀錄與附件可繼續查閱。</p>}
    <Dialog open={modalOpen} onOpenChange={open => { if (!open && !busy) setModalOpen(false); }}><DialogContent className="mf-action-dialog" data-keyboard={viewport.bottom > 100} style={{ '--mf-keyboard-gap': `${viewport.bottom}px`, '--mf-visible-height': `${viewport.height}px` } as React.CSSProperties}><DialogTitle>{modal === 'assign' ? '指派負責人' : modal === 'resolve' ? '解決這筆故障' : '編輯故障資料'}</DialogTitle><DialogDescription>{modal === 'assign' ? '可共同處理；直接使用有維修編輯權限的平台帳號。' : modal === 'resolve' ? '請用目前專案的分類整理原因，方便之後查找反覆發生的故障。' : '只更新這筆故障的機台與問題名稱，原始描述仍會保留。'}</DialogDescription>
      <form onSubmit={event => { event.preventDefault(); if (modal === 'assign') void mutate({ assignee_user_ids: owners }, '負責人已更新', version); else if (modal === 'resolve') void mutate({ maintenance_status: 'resolved', category }, '故障已解決', version); else { const system = data.systems.find(item => (item.serial_number?.trim() || item.system_name) === asset.trim()); void mutate({ title, asset_identifier: asset, system_id: system?.id || null }, '故障資料已更新', version); } }}>
        {modal === 'assign' ? <><Input aria-label="搜尋平台帳號" placeholder="搜尋姓名或帳號" value={peopleQuery} onChange={event => setPeopleQuery(event.target.value)}/>{issue.assigned_to && !issue.assignee_user_ids.length && <p className="mf-hint">原負責人：{issue.assigned_to}。儲存後改為下方平台帳號，原指派會保留在紀錄。</p>}<div className="mf-people">{data.people.filter(person => `${person.name} ${person.username}`.toLocaleLowerCase().includes(peopleQuery.toLocaleLowerCase())).map(person => <label key={person.id}><input type="checkbox" checked={owners.includes(person.id)} onChange={event => setOwners(previous => event.target.checked ? [...previous, person.id] : previous.filter(id => id !== person.id))}/><span>{person.name}</span><small>{person.username}</small>{owners.includes(person.id) && <Check size={15}/>}</label>)}</div><p className="mf-hint">已選 {owners.length} 人；全部取消即為未分派。</p></> : modal === 'resolve' ? <><label htmlFor="mf-close-category">故障分類 <span>必填</span></label><Input id="mf-close-category" autoFocus list="mf-categories" value={category} onChange={event => setCategory(event.target.value)} maxLength={100} required placeholder="選擇既有分類，或輸入新分類"/><datalist id="mf-categories">{data.categories.map(value => <option key={value} value={value}/>)}</datalist></> : <><label htmlFor="mf-edit-asset">機台序號／資產編號</label><Input id="mf-edit-asset" value={asset} onChange={event => setAsset(event.target.value)} maxLength={200} required/><label htmlFor="mf-edit-title">故障名稱</label><Textarea id="mf-edit-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={300} required/></>}
        {error && <p className="mf-error" role="alert">{error}</p>}<footer><Button type="button" variant="ghost" disabled={busy} onClick={() => setModalOpen(false)}>取消</Button><Button className="mf-submit" type="submit" disabled={busy} aria-busy={pending === 'update' || undefined}>{pending === 'update' && <MaintenanceSpinner />}{pending === 'update' ? '儲存中…' : modal === 'resolve' ? '確認已解決' : '儲存'}</Button></footer>
      </form>
    </DialogContent></Dialog>
  </section>;
}
