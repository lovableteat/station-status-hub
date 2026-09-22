import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { AssessmentAttachments as ManagerAttachments } from './AssessmentAttachments';
import type { AssessmentEntry, AssessmentSection, Category, ManagerAssessment, ReviewAttachment } from './assessmentTypes';

function focusAssessmentEntry(category: Category, entryId: string) {
  const target = document.getElementById(`rd2-entry-${category}-${entryId}`);
  target?.scrollIntoView({ block: 'center', behavior: 'auto' });
  target?.focus({ preventScroll: true });
  return Boolean(target);
}

export function AssessmentReturnHistory({ manager, sections }: { manager: ManagerAssessment; sections?: Record<Category, AssessmentSection> }) {
  const [missingEntry, setMissingEntry] = useState(false);
  if (!manager.returnHistory.length) return null;
  const events = [...manager.returnHistory].reverse();
  const latestByItem = new Map<string, (typeof events[number]['entries'][number]) & { returnedAt: string; reviewerName: string; eventId: string }>();
  const itemCounts = new Map<string, number>();
  for (const event of manager.returnHistory) {
    for (const item of event.entries) {
      const key = `${item.category}:${item.entryId}`;
      itemCounts.set(key, (itemCounts.get(key) || 0) + 1);
    }
  }
  for (const event of events) {
    for (const item of event.entries) {
      const key = `${item.category}:${item.entryId}`;
      if (!latestByItem.has(key)) latestByItem.set(key, { ...item, returnedAt: event.returnedAt, reviewerName: event.reviewerName, eventId: event.id });
    }
  }
  const latestItems = [...latestByItem.entries()];
  const latestEvent = events[0];
  return <section id="rd2-return-feedback" className="rd2-return-history" data-return-state="returned" aria-label="主管退回回應">
    <header className="rd2-return-history-header">
      <div>
        <div className="rd2-return-kicker"><span>需要補充</span><strong>{latestItems.length} 個項目</strong></div>
        <h3>主管退回回應</h3>
        <p className="rd2-hint">請依每個項目的原因補充自評，完成後再送出。</p>
      </div>
      <div className="rd2-return-latest">
        <span>最近一次退回</span>
        <strong>{new Date(latestEvent.returnedAt).toLocaleString('zh-TW')}</strong>
        <small>{latestEvent.reviewerName}</small>
      </div>
    </header>
    {missingEntry && <p className="rd2-return-missing" role="status">這筆實績已移除；退回原因仍保留，請直接在下方補充或新增實績。</p>}
    <div className="rd2-return-item-list">
      {latestItems.map(([key, item]) => <article key={`${key}-${item.eventId}`} className="rd2-return-item-card">
        <div className="rd2-return-item-heading">
          <span className="rd2-return-category">{item.category} · 實績 {Math.max(1, (sections?.[item.category].entries || []).findIndex(entry => entry.id === item.entryId) + 1)}</span>
          <span className="rd2-return-item-count">第 {itemCounts.get(key) || 1} 次退回</span>
        </div>
        <h4>這筆實績需要補充</h4>
        <div className="rd2-return-reason">
          <span>主管回應</span>
          <p className="rd2-prewrap">{item.feedback}</p>
        </div>
        <details className="rd2-return-more">
          <summary>查看退回當時的內容{item.attachments.length ? ` · 附件 ${item.attachments.length}` : ''}</summary>
          <p className="rd2-prewrap">{item.text || '退回當時沒有保留文字內容。'}</p>
          <ManagerAttachments attachments={item.attachments} readonly />
        </details>
        <Button type="button" size="sm" variant="outline" onClick={() => setMissingEntry(!focusAssessmentEntry(item.category, item.entryId))}>前往這筆實績</Button>
      </article>)}
    </div>
    {events.length > 1 && <details className="rd2-return-archive">
      <summary>查看過往退回紀錄 · 共 {events.length} 次</summary>
      <ol>
        {events.slice(1).map(event => <li key={event.id}>
          <strong>{new Date(event.returnedAt).toLocaleString('zh-TW')}</strong>
          <span>{event.reviewerName} · {event.entries.length} 個項目</span>
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
  const value = manager.entryReviews[category][entry.id] || { feedback: '', returnRequested: false, attachments: [] };
  const history = manager.returnHistory.flatMap(event => event.entries
    .filter(item => item.category === category && item.entryId === entry.id)
    .map(item => ({ ...item, id: event.id, returnedAt: event.returnedAt, reviewerName: event.reviewerName })));
  if (!editable && !history.length && !(showFeedback && (value.feedback || value.attachments.length))) return null;
  const label = `${category} 實績 ${index + 1}`;
  return <div className="rd2-entry-feedback">
    {!editable && showFeedback && (value.feedback || value.attachments.length > 0) && <div className="rd2-entry-response" data-return-state={history.length ? "returned" : undefined}>
      <strong>{history.length ? "主管逐項退回回應" : "主管逐項回應"}</strong>
      {value.feedback && <p className="rd2-prewrap">{value.feedback}</p>}
      <ManagerAttachments attachments={value.attachments} readonly />
    </div>}
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
    {editable && history.length > 0 && <details data-return-state="returned">
      <summary>這筆實績的退回紀錄（{history.length} 次）</summary>
      {[...history].reverse().map(item => <div key={item.id} className="rd2-return-history-item">
        <small>{new Date(item.returnedAt).toLocaleString('zh-TW')} · {item.reviewerName}</small>
        <p className="rd2-prewrap">{item.feedback}</p>
        <ManagerAttachments attachments={item.attachments} readonly />
      </div>)}
    </details>}
  </div>;
}
