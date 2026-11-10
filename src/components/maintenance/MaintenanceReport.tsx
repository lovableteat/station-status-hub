import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import type { Fault, MaintenanceSystem } from './maintenanceModel';
import { FilePicker, useFaultFiles } from './MaintenanceAttachments';
import { maintenanceError, useMaintenanceViewport } from './useMaintenanceData';

export function MaintenanceReport({ projectId, systems, assetSuggestions = [], onClose, onCreated }: {
  projectId: string; systems: MaintenanceSystem[]; assetSuggestions?: string[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [asset, setAsset] = useState(''), [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [saved, setSaved] = useState<Fault | null>(null);
  const requestId = useRef(crypto.randomUUID()), messageId = useRef(crypto.randomUUID());
  const files = useFaultFiles();
  const viewport = useMaintenanceViewport();
  const system = systems.find(item => (item.serial_number?.trim() || item.system_name) === asset.trim());
  const close = () => { if (!busy && (saved || (!asset && !title && !files.files.length) || window.confirm('尚未送出的內容將放棄，確定關閉？'))) onClose(); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      let issue = saved;
      if (!issue) {
        const result = await supabase.rpc('maintenance_create_fault', { p_issue_id: requestId.current, p_project_id: projectId, p_asset_identifier: asset, p_title: title, p_system_id: system?.id });
        if (result.error) throw result.error;
        issue = result.data as unknown as Fault; setSaved(issue);
      }
      if (files.files.length) {
        const note = await supabase.rpc('maintenance_add_note', { p_issue_id: issue.id, p_message_id: messageId.current, p_body: '報修附件' });
        if (note.error) throw note.error;
        await files.upload(issue.id, messageId.current);
      }
      onCreated(issue.id);
    } catch (cause) { setError(maintenanceError(cause)); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="mf-report-dialog" style={{ '--mf-visible-height': `${viewport.height}px`, '--mf-keyboard-gap': `${viewport.bottom}px` } as React.CSSProperties} onInteractOutside={event => { if (busy) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
    <header><DialogTitle>快速報修</DialogTitle><DialogDescription>先記下哪台、什麼問題，負責人與分類稍後再補。</DialogDescription></header>
    <form onSubmit={submit} onPaste={event => { if (!busy && !saved && event.clipboardData.files.length) { event.preventDefault(); files.add(event.clipboardData.files); } }}>
      <div className="mf-report-fields">
        <label htmlFor="mf-asset">機台序號／資產編號 <span>必填</span></label>
        <Input id="mf-asset" autoFocus list="mf-known-assets" value={asset} onChange={event => setAsset(event.target.value)} maxLength={200} required disabled={busy || !!saved} placeholder="輸入或選擇，例如 GB300-021" autoComplete="off"/>
        <datalist id="mf-known-assets">{systems.map(item => <option key={item.id} value={item.serial_number?.trim() || item.system_name}>{item.system_name}</option>)}{assetSuggestions.filter(value => !systems.some(item => (item.serial_number?.trim() || item.system_name) === value)).map(value => <option key={value} value={value}>曾報修機台</option>)}</datalist>
        <p className="mf-hint">{system ? `已連結原機台：${system.system_name}` : '新機台也能直接報修，不用先建立站點或流程。'}</p>
        <label htmlFor="mf-problem">遇到什麼問題？ <span>必填</span></label>
        <Textarea id="mf-problem" rows={3} value={title} onChange={event => setTitle(event.target.value)} maxLength={300} required disabled={busy || !!saved} placeholder="例如：無法開機，電源燈未亮"/>
        <FilePicker state={files} disabled={busy}/>
        {error && <p className="mf-error" role="alert">{saved && '故障已建立。'}{error}</p>}
      </div>
      <footer><Button type="button" variant="ghost" disabled={busy} onClick={close}>{saved ? '稍後補附件' : '取消'}</Button><Button type="submit" disabled={busy}>{busy ? '儲存中…' : saved ? '重試剩餘附件' : '建立報修'}</Button></footer>
    </form>
  </DialogContent></Dialog>;
}
