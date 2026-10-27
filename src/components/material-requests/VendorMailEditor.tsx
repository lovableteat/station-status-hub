import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VENDOR_MAIL_ITEMS_TOKEN } from './materialRequestExport';

export interface VendorMailEditorHandle { snapshot(): string }

export const VendorMailEditor = forwardRef<VendorMailEditorHandle, {
  value: string; onChange(html: string): void; onBusyChange(busy: boolean): void;
}>(function VendorMailEditor({ value, onChange, onBusyChange }, ref) {
  const editor = useRef<HTMLDivElement | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const latest = useRef(value), emitted = useRef(value), composing = useRef(false), pending = useRef(0);
  const range = useRef<Range | null>(null), epoch = useRef(0);
  const [error, setError] = useState('');
  const publishBusy = () => onBusyChange(composing.current || pending.current > 0);
  const emit = () => {
    if (!editor.current) return;
    latest.current = emitted.current = editor.current.innerHTML;
    onChange(latest.current);
  };
  const mount = useCallback((node: HTMLDivElement | null) => {
    editor.current = node;
    if (node) node.innerHTML = latest.current;
  }, []);
  useEffect(() => {
    if (value !== emitted.current && !composing.current) {
      latest.current = emitted.current = value;
      if (editor.current) editor.current.innerHTML = value;
    }
  }, [value]);
  useEffect(() => { epoch.current += 1; return () => { epoch.current += 1; }; }, []);
  useImperativeHandle(ref, () => ({ snapshot() {
    if (composing.current) throw new Error('請先完成輸入法選字，再匯出信件');
    if (pending.current) throw new Error('圖片仍在讀取，完成後即可匯出');
    return editor.current?.innerHTML ?? latest.current;
  } }));
  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.current?.contains(selection.getRangeAt(0).commonAncestorContainer)) range.current = selection.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    const node = editor.current;
    if (!node) return;
    node.focus();
    const selected = range.current;
    const target = selected && node.contains(selected.commonAncestorContainer) ? selected : document.createRange();
    if (target !== selected) { target.selectNodeContents(node); target.collapse(false); }
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(target);
  };
  const command = (name: string, argument?: string) => {
    restoreSelection(); document.execCommand(name, false, argument); rememberSelection(); emit();
  };
  const insertImages = async (files: File[]) => {
    const images = files.filter(file => file.type.startsWith('image/'));
    if (!images.length) return;
    const activeEpoch = epoch.current;
    pending.current += 1; publishBusy(); setError('');
    try {
      for (const file of images) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('圖片讀取失敗'));
          reader.onerror = reader.onabort = () => reject(new Error('圖片讀取失敗'));
          reader.readAsDataURL(file);
        });
        if (epoch.current !== activeEpoch || !editor.current) return;
        const image = document.createElement('img'); image.src = dataUrl; image.alt = file.name;
        image.style.cssText = 'max-width:100%;height:auto';
        command('insertHTML', image.outerHTML);
      }
    } catch (cause) { if (epoch.current === activeEpoch) setError(cause instanceof Error ? cause.message : '圖片讀取失敗'); }
    finally { pending.current -= 1; if (epoch.current === activeEpoch) publishBusy(); }
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor="pending-mail-content" className="font-semibold">信件內容與簽名</label>
      <div role="toolbar" aria-label="信件格式" className="flex flex-wrap items-center gap-1">
        {([['粗體', 'bold', 'B'], ['底線', 'underline', 'U'], ['項目清單', 'insertUnorderedList', '• 清單']] as const).map(([label, action, text]) => <Button key={action} type="button" size="sm" variant="ghost" aria-label={label} onMouseDown={event => event.preventDefault()} onClick={() => command(action)}>{text}</Button>)}
        <Button type="button" size="sm" variant="ghost" onMouseDown={event => event.preventDefault()} onClick={() => { const url = window.prompt('連結網址'); if (url && /^(https?:|mailto:)/i.test(url)) command('createLink', url); }}>連結</Button>
        <Button type="button" size="sm" variant="outline" onMouseDown={event => event.preventDefault()} onClick={() => { rememberSelection(); picker.current?.click(); }}><ImagePlus className="mr-1 h-4 w-4" />圖片</Button>
        <Button type="button" size="sm" variant="outline" onMouseDown={event => event.preventDefault()} onClick={() => command('insertText', VENDOR_MAIL_ITEMS_TOKEN)}>插入料件位置</Button>
      </div>
    </div>
    <p id="pending-mail-content-hint" className="text-sm text-muted-foreground">在同一區編輯開頭與簽名，保留一個 {VENDOR_MAIL_ITEMS_TOKEN}，匯出時會換成各廠商的料件表格。</p>
    <input ref={picker} type="file" accept="image/*" multiple className="hidden" aria-label="信件圖片" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void insertImages(files); }} />
    <div ref={mount} id="pending-mail-content" role="textbox" aria-label="信件內容與簽名" aria-describedby="pending-mail-content-hint" aria-multiline contentEditable suppressContentEditableWarning
      onInput={emit} onBlur={emit} onKeyUp={rememberSelection} onMouseUp={rememberSelection}
      onCompositionStart={() => { composing.current = true; publishBusy(); }} onCompositionEnd={() => { composing.current = false; emit(); publishBusy(); }}
      onPaste={event => { const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); rememberSelection(); void insertImages(files); } }}
      onDrop={event => { const files = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); rememberSelection(); void insertImages(files); } }}
      className="material-mail-editor min-h-52 rounded-xl border border-input bg-background/60 px-4 py-3 leading-7 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 [&_a]:text-primary [&_a]:underline [&_img]:my-2 [&_img]:max-h-72 [&_img]:max-w-full [&_ul]:list-disc [&_ul]:pl-6" />
    {error ? <p role="alert" className="text-sm text-destructive">{error}，已輸入的內容仍保留。</p> : null}
  </div>;
});
