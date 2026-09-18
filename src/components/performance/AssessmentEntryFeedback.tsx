import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { AssessmentAttachments as ManagerAttachments } from './AssessmentAttachments';
import type { AssessmentEntry, Category, ManagerAssessment, ReviewAttachment } from './assessmentTypes';

function focusAssessmentEntry(category: Category, entryId: string) {
  const target = document.getElementById(`rd2-entry-${category}-${entryId}`);
  target?.scrollIntoView({ block: 'center', behavior: 'auto' });
  target?.focus({ preventScroll: true });
  return Boolean(target);
}

export function AssessmentReturnHistory({ manager }: { manager: ManagerAssessment }) {
  const [missingEntry, setMissingEntry] = useState(false);
  if (!manager.returnHistory.length) return null;
  return <section id="rd2-return-feedback" className="rd2-return-history" aria-label="逐筆退回紀錄">
    <h3>實績退回紀錄（{manager.returnHistory.length} 次）</h3>
    <p className="rd2-hint">每次原因均保留；點「前往實績」可查看並補充該筆內容。</p>
    {missingEntry && <p role="status">這筆實績已移除；退回原因及當時內容仍保留在紀錄中。</p>}
    {[...manager.returnHistory].reverse().map((event, index) => <details key={event.id} open={index === 0}>
      <summary>{new Date(event.returnedAt).toLocaleString('zh-TW')} · {event.reviewerName} · {event.entries.length} 筆</summary>
      {event.entries.map(item => <div key={`${item.category}-${item.entryId}`} className="rd2-return-history-item">
        <strong>{item.category} · 退回原因</strong>
        <p className="rd2-prewrap">{item.feedback}</p>
        <ManagerAttachments attachments={item.attachments} readonly />
        <details><summary>退回當時的實績內容</summary><p className="rd2-prewrap">{item.text}</p></details>
        <Button type="button" size="sm" variant="outline" onClick={() => setMissingEntry(!focusAssessmentEntry(item.category, item.entryId))}>前往實績</Button>
      </div>)}
    </details>)}
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
  const value = manager.entryReviews[category][entry.id] || { feedback: '', returnRequested: false, attachments: [] };
  const history = manager.returnHistory.flatMap(event => event.entries
    .filter(item => item.category === category && item.entryId === entry.id)
    .map(item => ({ ...item, id: event.id, returnedAt: event.returnedAt, reviewerName: event.reviewerName })));
  if (!editable && !history.length && !(showFeedback && (value.feedback || value.attachments.length))) return null;
  const label = `${category} 實績 ${index + 1}`;
  return <div className="rd2-entry-feedback">
    {!editable && showFeedback && (value.feedback || value.attachments.length > 0) && <>
      <strong>主管逐項回應</strong>
      {value.feedback && <p className="rd2-prewrap">{value.feedback}</p>}
      <ManagerAttachments attachments={value.attachments} readonly />
    </>}
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
    {history.length > 0 && <details open={!editable}>
      <summary>這筆實績的退回紀錄（{history.length} 次）</summary>
      {[...history].reverse().map(item => <div key={item.id} className="rd2-return-history-item">
        <small>{new Date(item.returnedAt).toLocaleString('zh-TW')} · {item.reviewerName}</small>
        <p className="rd2-prewrap">{item.feedback}</p>
        <ManagerAttachments attachments={item.attachments} readonly />
      </div>)}
    </details>}
  </div>;
}
