import { PrivateAttachmentImage } from '@/components/attachments/PrivateAttachmentImage';
import { downloadPrivateAttachment } from '@/lib/privateAttachments';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Paperclip, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { ComposerFile } from './maintenanceComposerDraft';
import type { FaultAttachment } from './maintenanceModel';
import { maintenanceError } from './useMaintenanceData';

export interface PendingFile { id: string; file: File; preview: string; error?: string }
export function useFaultFiles() {
  const [files, setFiles] = useState<PendingFile[]>([]), [error, setError] = useState('');
  const urls = useRef(new Set<string>());
  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const add = (incoming: FileList | File[]) => {
    const rejected: string[] = [], accepted: PendingFile[] = [];
    for (const file of Array.from(incoming)) {
      if (!file.size || file.size > 50 * 1024 * 1024) { rejected.push(file.name); continue; }
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
      if (preview) urls.current.add(preview);
      accepted.push({ id: crypto.randomUUID(), file, preview });
    }
    setFiles(previous => [...previous, ...accepted]);
    setError(rejected.length ? `未加入：${rejected.join('、')}。每檔須為1 byte至50MB；其他檔案已保留。` : '');
  };
  const remove = (id: string) => setFiles(previous => previous.filter(item => { if (item.id !== id) return true; if (item.preview) { URL.revokeObjectURL(item.preview); urls.current.delete(item.preview); } return false; }));
  const upload = async (issueId: string, messageId: string) => {
    const failed: PendingFile[] = [];
    for (const item of files) {
      try {
        const path = `${issueId}/${messageId}/${item.id}`;
        const result = await supabase.storage.from('issue-attachments').upload(path, item.file, { upsert: true, contentType: item.file.type || 'application/octet-stream' });
        if (result.error) throw result.error;
        const metadata = await supabase.rpc('maintenance_add_attachment', { p_issue_id: issueId, p_message_id: messageId, p_file: {
          id: item.id, file_path: path, file_name: item.file.name, file_size: item.file.size, file_type: item.file.type,
        } });
        if (metadata.error) throw metadata.error;
        if (item.preview) { URL.revokeObjectURL(item.preview); urls.current.delete(item.preview); }
      } catch (cause) { failed.push({ ...item, error: maintenanceError(cause) }); }
    }
    setFiles(failed);
    if (failed.length) throw new Error(`${failed.length}個附件未完成：${failed.map(item => item.file.name).join('、')}。成功項目已保存，請重試剩餘附件。`);
  };
  return { files, add, remove, upload, error };
}
/** Preview URLs belong only to this mounted view; checkpoints contain original Files. */
export function useComposerFilePreviews(source: ComposerFile[], change: (update: (files: ComposerFile[]) => ComposerFile[]) => void) {
  const [error, setError] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  useEffect(() => {
    const previews = source.map(item => ({ ...item, preview: item.file.type.startsWith('image/') ? URL.createObjectURL(item.file) : '' }));
    setFiles(previews);
    return () => { previews.forEach(item => { if (item.preview) URL.revokeObjectURL(item.preview); }); };
  }, [source]);
  const add = (incoming: FileList | File[]) => {
    const accepted: ComposerFile[] = [], rejected: string[] = [];
    for (const file of Array.from(incoming)) {
      if (!file.size || file.size > 50 * 1024 * 1024) rejected.push(file.name);
      else accepted.push({ id: crypto.randomUUID(), file });
    }
    change(previous => [...previous, ...accepted]);
    setError(rejected.length ? `未加入：${rejected.join('、')}。每檔須為1 byte至50MB；其他檔案已保留。` : '');
  };
  return { files, add, remove: (id: string) => change(previous => previous.filter(item => item.id !== id)), error };
}
export type FaultFiles = ReturnType<typeof useFaultFiles>;

export function FilePicker({ state, disabled }: { state: Pick<FaultFiles, 'files' | 'add' | 'remove' | 'error'>; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="mf-files" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) state.add(event.dataTransfer.files); }}>
    <input ref={input} type="file" multiple hidden disabled={disabled} onChange={event => { if (event.target.files) state.add(event.target.files); event.target.value = ''; }} />
    <Button type="button" variant="outline" disabled={disabled} onClick={() => input.current?.click()}><ImagePlus size={17} />加入照片／附件</Button>
    <span className="mf-hint">可連續貼圖、多選或拖入，每檔50MB</span>
    {state.error && <p role="alert" className="mf-error">{state.error}</p>}
    {!!state.files.length && <div className="mf-file-grid">{state.files.map(item => <div className="mf-pending-file" key={item.id}>
      {item.preview ? <img src={item.preview} alt={item.file.name} /> : <Paperclip size={24} />}
      <span title={item.file.name}>{item.file.name}</span>
      <button type="button" aria-label={`移除 ${item.file.name}`} disabled={disabled} onClick={() => state.remove(item.id)}><X size={15}/></button>
      {item.error && <small role="alert">{item.error}</small>}
    </div>)}</div>}
  </div>;
}

export function AttachmentGallery({ attachments }: { attachments: FaultAttachment[] }) {
  const [preview, setPreview] = useState<FaultAttachment | null>(null);
  const [downloadError, setDownloadError] = useState('');
  const download = (file: FaultAttachment) => {
    setDownloadError('');
    void downloadPrivateAttachment('issue-attachments', file.file_path, file.file_name).catch(() => setDownloadError('附件下載失敗，請確認登入與存取權限。'));
  };
  return <><div className="mf-attachment-grid">{attachments.map(file => <div key={file.id}>
    {file.file_type?.startsWith('image/') ? <button type="button" className="mf-image" onClick={() => setPreview(file)} aria-label={`放大 ${file.file_name}`}><PrivateAttachmentImage path={file.file_path} loading="lazy" alt={file.file_name}/></button> : <Paperclip size={22}/>}
    <button type="button" className="mf-attachment-download" onClick={() => download(file)} title={file.file_name}>下載 {file.file_name}</button>
  </div>)}</div>{downloadError && <p role="alert" className="mf-error">{downloadError}</p>}
  <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="mf-image-dialog"><DialogTitle>{preview?.file_name}</DialogTitle>{preview && <PrivateAttachmentImage path={preview.file_path} alt={preview.file_name}/>}</DialogContent></Dialog></>;
}
