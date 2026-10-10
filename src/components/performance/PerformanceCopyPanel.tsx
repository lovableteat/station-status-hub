import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** Local text transfer only: never saves or submits an appraisal. */
export function PerformanceCopyPanel({ getText, disabled = false, contextKey = '' }: {
  getText: () => string;
  disabled?: boolean;
  contextKey?: string;
}) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [selectText, setSelectText] = useState(false);
  useEffect(() => {
    const stateVersion = generation;
    ++stateVersion.current;
    running.current = false;
    setBusy(false); setExpanded(false); setText(''); setMessage(''); setSelectText(false);
    return () => { ++stateVersion.current; };
  }, [contextKey, disabled]);
  useEffect(() => {
    if (selectText && expanded && !disabled) {
      field.current?.focus();
      field.current?.select();
      setSelectText(false);
    }
  }, [selectText, expanded, disabled]);
  const copy = async () => {
    if (disabled || running.current) return;
    const version = generation.current;
    running.current = true;
    setBusy(true); setMessage('');
    let prepared: string | undefined;
    try {
      prepared = getText();
      setText(prepared);
      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
      await navigator.clipboard.writeText(prepared);
      if (version === generation.current) setMessage('已複製全部實績，可直接貼入單一欄位。');
    } catch (error) {
      if (version === generation.current) {
        if (prepared !== undefined) {
          setText(prepared); setExpanded(true); setSelectText(true);
          setMessage('請在下方選取文字複製（Ctrl／⌘ + C）。');
        } else {
          setText(''); setExpanded(false);
          setMessage(error instanceof Error ? error.message : '目前無法整理文字，請確認考核已讀取完成。');
        }
      }
    } finally {
      if (version === generation.current) { running.current = false; setBusy(false); }
    }
  };
  const toggle = () => {
    if (disabled) return;
    if (expanded) { setExpanded(false); return; }
    try { setText(getText()); setExpanded(true); setMessage(''); }
    catch (error) { setText(''); setExpanded(false); setMessage(error instanceof Error ? error.message : '目前無法整理文字。'); }
  };
  return <div className="rd2-copy-panel" aria-label="整合自評文字">
    <div className="rd2-copy-panel-actions">
      <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => void copy()}>
        {message.startsWith('已複製') ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {busy ? '複製中…' : '一鍵複製全部實績'}
      </Button>
      <Button type="button" variant="ghost" disabled={disabled} aria-expanded={!disabled && expanded} aria-controls={id} onClick={toggle}>
        <ChevronDown aria-hidden="true" />{expanded && !disabled ? '收合整合文字' : '檢視整合文字'}
      </Button>
    </div>
    {!disabled && message && <p role="status" className="rd2-copy-status">{message}</p>}
    {!disabled && expanded && <div id={id} className="rd2-copy-preview">
      <label htmlFor={`${id}-text`}>IDP、OKR、KPI 完整文字</label>
      <p>已依類別與實績編號整理；可直接選取、複製到單一欄位。</p>
      <Textarea ref={field} id={`${id}-text`} readOnly value={text} rows={12} aria-label="IDP、OKR、KPI 整合文字" />
    </div>}
  </div>;
}
