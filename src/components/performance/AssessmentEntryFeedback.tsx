import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, Copy, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { AssessmentAttachments as ManagerAttachments } from './AssessmentAttachments';
import type { AssessmentEntry, Category, ManagerAssessment, ReviewAttachment } from './assessmentTypes';

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

export function AssessmentReturnHistory({ manager }: { manager: ManagerAssessment }) {
  if (!manager.returnHistory.length) return null;
  const events = [...manager.returnHistory].reverse();
  const latestEvent = events[0];
  const overallFeedback = latestEvent.overallFeedback || manager.feedback;
  const workInstructions = latestEvent.workInstructions || manager.workInstructions;
  return <section id="rd2-return-feedback" className="rd2-return-history" data-return-state="returned" aria-label="主管退回回應">
    <header className="rd2-return-history-header">
      <div>
        <div className="rd2-return-kicker"><span>需要補充</span><strong>{latestEvent.entries.length} 個項目</strong></div>
        <h3>主管退回回應</h3>
        <p className="rd2-hint">請依每個項目的原因補充自評，完成後再送出。</p>
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
    <p className="rd2-return-inline-hint">逐筆回覆請由下方對應實績的「主管回覆」查看。</p>
    {events.length > 1 && <details className="rd2-return-archive">
      <summary>查看過往退回紀錄 · 共 {events.length} 次</summary>
      <ol>
        {events.slice(1).map(event => <li key={event.id}>
          <strong>{new Date(event.returnedAt).toLocaleString('zh-TW')}</strong>
          <span>{event.reviewerName} · {event.entries.length} 個項目</span>
          {event.overallFeedback && <p><b>整體回覆：</b>{event.overallFeedback}</p>}
          {event.workInstructions && <p><b>工作指示：</b>{event.workInstructions}</p>}
          <ul>{event.entries.map(item => <li key={`${event.id}-${item.category}-${item.entryId}`}><b>{item.category}</b>：{item.feedback}</li>)}</ul>
        </li>)}
      </ol>
    </details>}
  </section>;
}

export function AssessmentEntryFeedback({ category, entry, index, manager, editable = false, showFeedback = false, disabled = false, onChange, onReturn, onBusy, onError }: {
  category: Category; entry: AssessmentEntry; index: number; manager: ManagerAssessment;
  editable?: boolean; showFeedback?: boolean; disabled?: boolean;
  onChange?: (feedback: string, returnRequested: boolean, attachments: ReviewAttachment[]) => void;
  onReturn?: () => void;
  onBusy?: (busy: boolean) => void;
  onError?: (message: string) => void;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  const value = manager.entryReviews[category][entry.id] || { feedback: '', returnRequested: false, attachments: [] };
  const history = manager.returnHistory.flatMap(event => event.entries
    .filter(item => item.category === category && item.entryId === entry.id)
    .map(item => ({ ...item, id: event.id, returnedAt: event.returnedAt, reviewerName: event.reviewerName })));
  const latestReturn = history.at(-1);
  const visibleFeedback = latestReturn?.feedback || value.feedback;
  const visibleAttachments = latestReturn?.attachments?.length ? latestReturn.attachments : value.attachments;
  if (!editable && !(showFeedback && (visibleFeedback || visibleAttachments.length))) return null;
  const label = `${category} 實績 ${index + 1}`;
  if (!editable) return <div className="rd2-entry-feedback rd2-entry-feedback-inline">
    <details className="rd2-inline-supervisor-reply">
      <summary aria-label={`查看 ${label} 主管回覆`}>
        <MessageSquareText aria-hidden="true" />
        主管回覆
      </summary>
      <div className="rd2-inline-supervisor-reply-body">
        <div className="rd2-inline-supervisor-reply-heading">
          <strong>{label} · 主管回覆</strong>
          {visibleFeedback && <Button type="button" size="sm" variant="ghost" onClick={async () => {
            try {
              await copyReply(visibleFeedback);
              setCopyStatus('已複製');
              window.setTimeout(() => setCopyStatus(''), 1800);
            } catch {
              setCopyStatus('請選取文字複製');
            }
          }}>
            {copyStatus === '已複製' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copyStatus || '複製回覆'}
          </Button>}
        </div>
        {visibleFeedback && <p className="rd2-prewrap">{visibleFeedback}</p>}
        <ManagerAttachments attachments={visibleAttachments} readonly />
      </div>
    </details>
  </div>;
  return <div className="rd2-entry-feedback">
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
