import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, ChevronDown, Copy, History, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { AssessmentAttachments as ManagerAttachments } from './AssessmentAttachments';
import type { AssessmentEntry, AssessmentSection, Category, ManagerAssessment, ReviewAttachment } from './assessmentTypes';

async function copyReply(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  document.execCommand('copy');
  field.remove();
}

function CopyReplyButton({ text, label = '複製回覆' }: { text: string; label?: string }) {
  const [copyStatus, setCopyStatus] = useState('');
  if (!text) return null;
  return <Button type="button" size="sm" variant="ghost" onClick={async () => {
    try {
      await copyReply(text);
      setCopyStatus('已複製');
      window.setTimeout(() => setCopyStatus(''), 1800);
    } catch { setCopyStatus('請選取文字複製'); }
  }}>
    {copyStatus === '已複製' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    {copyStatus || label}
  </Button>;
}

export function AssessmentReturnHistory({ manager, sections, viewer = 'employee' }: { manager: ManagerAssessment; sections?: Record<Category, AssessmentSection>; viewer?: 'employee' | 'manager' }) {
  if (!manager.returnHistory.length) return null;
  const events = [...manager.returnHistory].reverse();
  const latestEvent = events[0];
  const overallFeedback = latestEvent.overallFeedback || manager.feedback;
  const workInstructions = latestEvent.workInstructions || manager.workInstructions;
  const entryLabel = (item: typeof latestEvent.entries[number]) => {
    const position = sections?.[item.category]?.entries?.findIndex(entry => entry.id === item.entryId) ?? -1;
    return position >= 0 ? `${item.category} · 實績 ${position + 1}` : `${item.category} · 退回實績`;
  };
  return <section id="rd2-return-feedback" className="rd2-return-history" data-return-state="returned" aria-label="主管退回回應">
    <header className="rd2-return-history-header">
      <div>
        <div className="rd2-return-kicker"><span>需要補充</span><strong>{latestEvent.entries.length} 個項目</strong></div>
        <h3>{viewer === 'manager' ? '已送出的退回紀錄' : '主管退回回應'}</h3>
        <p className="rd2-hint">{viewer === 'manager' ? '這裡顯示已確認送出的內容；修改下方評語不會改動歷史紀錄。' : '請依每個項目的原因補充自評，完成後再送出。'}</p>
      </div>
      <div className="rd2-return-latest">
        <span>最近一次退回</span>
        <strong>{new Date(latestEvent.returnedAt).toLocaleString('zh-TW')}</strong>
        <small>{latestEvent.reviewerName}</small>
      </div>
    </header>
    <div className="rd2-return-overview" aria-label="本次主管整體回覆">
      <section>
        <span>主管整體回覆</span>
        <p className="rd2-prewrap">{overallFeedback || '本次未填寫整體回覆。'}</p>
      </section>
      <section>
        <span>後續工作指示</span>
        <p className="rd2-prewrap">{workInstructions || '本次未填寫後續工作指示。'}</p>
      </section>
    </div>
    <p className="rd2-return-inline-hint">{viewer === 'manager' ? '每筆實績旁的「退回紀錄」可查看該筆最近一次及過往退回內容。' : '逐筆回覆請由下方對應實績的「主管回覆」查看。'}</p>
    <details className="rd2-return-archive">
      <summary><History aria-hidden="true" /><strong>查看退回歷史紀錄</strong><span>共 {events.length} 次</span><ChevronDown aria-hidden="true" className="rd2-disclosure-chevron" /></summary>
      <ol className="rd2-return-event-list">
        {events.map((event, index) => <li key={event.id}>
          <details className="rd2-return-event" open={index === 0}>
            <summary>
              <strong>第 {events.length - index} 次退回{index === 0 ? ' · 最近一次' : ''}</strong>
              <span>{new Date(event.returnedAt).toLocaleString('zh-TW')} · {event.reviewerName} · {event.entries.length} 個項目</span>
              <ChevronDown aria-hidden="true" className="rd2-disclosure-chevron" />
            </summary>
            <div className="rd2-return-event-body">
              <div className="rd2-return-event-toolbar"><CopyReplyButton label="複製這次紀錄" text={[
                `第 ${events.length - index} 次退回`, new Date(event.returnedAt).toLocaleString('zh-TW'), event.reviewerName,
                event.overallFeedback && `主管整體回覆：\n${event.overallFeedback}`,
                event.workInstructions && `後續工作指示：\n${event.workInstructions}`,
                ...event.entries.map(item => `${entryLabel(item)}\n退回原因：${item.feedback || '當時未保存退回原因。'}${item.text ? `\n退回當時的實績：\n${item.text}` : ''}`),
              ].filter(Boolean).join('\n\n')} /></div>
              <div className="rd2-return-event-overview">
                <section><strong>主管整體回覆</strong><p className="rd2-prewrap">{event.overallFeedback || '當時未保存整體回覆。'}</p></section>
                <section><strong>後續工作指示</strong><p className="rd2-prewrap">{event.workInstructions || '當時未保存後續工作指示。'}</p></section>
              </div>
              <ul className="rd2-return-snapshot-list">{event.entries.map(item => <li key={`${event.id}-${item.category}-${item.entryId}`}>
                <strong>{entryLabel(item)}</strong>
                <p className="rd2-prewrap">{item.feedback || '當時未保存退回原因。'}</p>
                <ManagerAttachments attachments={item.attachments} readonly />
                {item.text && <details className="rd2-return-original"><summary>退回當時的實績</summary><p className="rd2-prewrap">{item.text}</p></details>}
              </li>)}</ul>
            </div>
          </details>
        </li>)}
      </ol>
    </details>
  </section>;
}

export function AssessmentEntryFeedback({ category, entry, index, manager, savedManager, historyOnly = false, editable = false, showFeedback = false, disabled = false, onChange, onReturn, onBusy, onError }: {
  category: Category; entry: AssessmentEntry; index: number; manager: ManagerAssessment;
  savedManager?: ManagerAssessment; historyOnly?: boolean;
  editable?: boolean; showFeedback?: boolean; disabled?: boolean;
  onChange?: (feedback: string, returnRequested: boolean, attachments: ReviewAttachment[]) => void;
  onReturn?: () => void;
  onBusy?: (busy: boolean) => void;
  onError?: (message: string) => void;
}) {
  const value = manager.entryReviews[category][entry.id] || { feedback: '', returnRequested: false, attachments: [] };
  const history = manager.returnHistory.flatMap(event => event.entries
    .filter(item => item.category === category && item.entryId === entry.id)
    .map(item => ({ ...item, id: event.id, returnedAt: event.returnedAt, reviewerName: event.reviewerName })));
  const latestReturn = history.at(-1);
  const visibleFeedback = historyOnly ? latestReturn?.feedback || '' : latestReturn?.feedback || value.feedback;
  const visibleAttachments = historyOnly ? latestReturn?.attachments || [] : latestReturn?.attachments?.length ? latestReturn.attachments : value.attachments;
  if (historyOnly && !history.length) return null;
  if (!editable && !(showFeedback && (visibleFeedback || visibleAttachments.length || history.length))) return null;
  const label = `${category} 實績 ${index + 1}`;
  if (!editable) return <div className="rd2-entry-feedback rd2-entry-feedback-inline">
    <details className="rd2-inline-supervisor-reply">
      <summary aria-label={`查看 ${label} ${historyOnly ? '退回紀錄' : '主管回覆'}`}>
        <MessageSquareText aria-hidden="true" />
        {historyOnly ? `退回紀錄 · ${history.length} 次` : '主管回覆'}
      </summary>
      <div className="rd2-inline-supervisor-reply-body">
        <div className="rd2-inline-supervisor-reply-heading">
          <strong>{label} · {historyOnly ? '最近一次退回' : '主管回覆'}</strong>
          <CopyReplyButton text={visibleFeedback} />
        </div>
        {historyOnly && latestReturn && <p className="rd2-hint">{new Date(latestReturn.returnedAt).toLocaleString('zh-TW')} · {latestReturn.reviewerName}</p>}
        {visibleFeedback && <p className="rd2-prewrap">{visibleFeedback}</p>}
        <ManagerAttachments attachments={visibleAttachments} readonly />
        {history.length > 1 && <details className="rd2-inline-reply-history">
          <summary>查看過往回覆 · {history.length - 1} 次</summary>
          <ol>{history.slice(0, -1).reverse().map(event => <li key={event.id}>
            <strong>{new Date(event.returnedAt).toLocaleString('zh-TW')} · {event.reviewerName}</strong>
            <p className="rd2-prewrap">{event.feedback || '當時未保存退回原因。'}</p>
            <CopyReplyButton text={event.feedback} />
            <ManagerAttachments attachments={event.attachments} readonly />
          </li>)}</ol>
        </details>}
      </div>
    </details>
  </div>;
  return <div className="rd2-entry-feedback">
    <AssessmentEntryFeedback category={category} entry={entry} index={index} manager={savedManager || manager} historyOnly showFeedback />
    {editable && <>
      <label htmlFor={`feedback-${category}-${entry.id}`}>{label} · 主管評語／退回原因</label>
      <Textarea id={`feedback-${category}-${entry.id}`} rows={3} value={value.feedback} disabled={disabled}
        placeholder="針對這筆實績填寫肯定、建議，或需要補充的內容"
        onChange={event => onChange?.(event.target.value, value.returnRequested, value.attachments)} />
      <ManagerAttachments attachments={value.attachments} readonly={false} disabled={disabled} buttonLabel="附加此筆檔案" onBusy={onBusy} onError={onError}
        label={`${label} · 主管回應附件`}
        onChange={attachments => onChange?.(value.feedback, value.returnRequested, attachments)} />
      <div className="rd2-entry-actions">
        <label><input type="checkbox" aria-label={`勾選退回 ${label}`} checked={value.returnRequested} disabled={disabled}
          onChange={event => onChange?.(value.feedback, event.target.checked, value.attachments)} /> 勾選退回</label>
        <Button type="button" size="sm" variant="outline" disabled={disabled || !value.feedback.trim()}
          aria-label={`退回 ${label}`} onClick={onReturn}>退回此筆</Button>
      </div>
    </>}
  </div>;
}
