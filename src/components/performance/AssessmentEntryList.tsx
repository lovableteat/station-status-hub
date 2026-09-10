import { Input } from "@/components/ui/input";
import { AssessmentAttachments } from "./AssessmentAttachments";
import { useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  appendAssessmentEntry,
  getAssessmentEntries,
  withAssessmentEntries,
} from "./assessmentEntries.mjs";
import type {
  AssessmentEntry,
  AssessmentSection,
  Category,
} from "./assessmentTypes";

export function AssessmentEntryList({
  category,
  section,
  readonly,
  onChange,
  onBusy,
  feedback,
  onFeedback,
}: {
  onBusy?: (busy: boolean) => void;
  feedback?: Record<string, string>;
  onFeedback?: (entryId: string, text: string) => void;
  category: Category;
  section: AssessmentSection;
  readonly: boolean;
  onChange: (
    update: (previous: AssessmentSection) => AssessmentSection,
  ) => void;
}) {
  const [linkDrafts, setLinkDrafts] = useState<Record<string,string>>({});
  const [attachmentError, setAttachmentError] = useState("");
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const entries: AssessmentEntry[] = getAssessmentEntries(section);
  const add = () => {
    if (readonly || !section.draftText?.trim()) return;
    onChange(appendAssessmentEntry);
    input.current?.focus();
  };
  return (
    <div className="rd2-achievements">
      {!readonly && (
        <Field>
          <FieldLabel htmlFor={`rd2-${category}`}>{category} 實績 *</FieldLabel>
          <Textarea
            ref={input}
            id={`rd2-${category}`}
            rows={5}
            placeholder={
              "寫下一條實績，再按「新增實績」\nS（情境）：…\nT（任務）：…\nA（行動）：…\nR（結果）：…"
            }
            value={section.draftText || ""}
            onChange={(event) =>
              onChange((previous) => ({
                ...previous,
                draftText: event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.ctrlKey || event.metaKey) &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                add();
              }
            }}
          />
          <div className="rd2-entry-composer-actions">
            <span className="rd2-hint">
              可連續新增；Ctrl / ⌘ + Enter 快速加入
            </span>
            <Button
              type="button"
              size="sm"
              onClick={add}
              disabled={!section.draftText?.trim()}
              aria-label={`新增 ${category} 實績`}
            >
              <Plus data-icon="inline-start" />
              新增實績
            </Button>
          </div>
        </Field>
      )}
      {attachmentError && <p role="alert" className="rd2-error">{attachmentError}</p>}
      <p className="rd2-entry-count" role="status">
        已新增 {entries.length} 條 {category} 實績
      </p>
      {entries.length ? (
        <ol className="rd2-entry-list" aria-label={`${category} 已新增實績`}>
          {entries.map((entry, index) => (
            <li key={entry.id} className="rd2-entry-item">
              <div className="rd2-entry-heading">
                <strong>實績 {index + 1}</strong>
                {!readonly && (
                  <div className="rd2-entry-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`${editingId === entry.id ? "完成編輯" : "編輯"} ${category} 實績 ${index + 1}`}
                      disabled={uploading || (editingId === entry.id && !entry.text.trim())}
                      onClick={() =>
                        setEditingId(editingId === entry.id ? null : entry.id)
                      }
                    >
                      {editingId === entry.id ? <Check /> : <Pencil />}
                      {editingId === entry.id ? "完成" : "編輯"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={uploading}
                      aria-label={`刪除 ${category} 實績 ${index + 1}`}
                      onClick={() => {
                        onChange((previous) =>
                          withAssessmentEntries(
                            previous,
                            getAssessmentEntries(previous).filter(
                              (item) => item.id !== entry.id,
                            ),
                          ),
                        );
                        if (editingId === entry.id) setEditingId(null);
                      }}
                    >
                      <Trash2 />
                      刪除
                    </Button>
                  </div>
                )}
              </div>
              {editingId === entry.id && !readonly ? (
                <Textarea
                  autoFocus
                  rows={5}
                  aria-label={`編輯 ${category} 實績 ${index + 1} 內容`}
                  value={entry.text}
                  onChange={(event) =>
                    onChange((previous) =>
                      withAssessmentEntries(
                        previous,
                        getAssessmentEntries(previous).map((item) =>
                          item.id === entry.id
                            ? { ...item, text: event.target.value }
                            : item,
                        ),
                      ),
                    )
                  }
                />
              ) : (
                <p className="rd2-prewrap">{entry.text || "尚未填寫內容"}</p>
              )}
              <AssessmentAttachments
                attachments={entry.attachments || []}
                readonly={readonly}
                label={`${category} 實績 ${index + 1} 附件`}
                buttonLabel="附加本筆實績檔案"
                onBusy={(busy) => { setUploading(busy); onBusy?.(busy); }}
                onError={setAttachmentError}
                onChange={(attachments) => onChange(previous => withAssessmentEntries(previous, getAssessmentEntries(previous).map(item => item.id === entry.id ? { ...item, attachments } : item)))}
              />
              {(entry.links || []).map(url => <div className="rd2-evidence-link" key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{!readonly && <Button type="button" variant="ghost" size="sm" aria-label={`移除 ${category} 實績 ${index+1} 證明連結`} onClick={()=>onChange(previous=>withAssessmentEntries(previous,getAssessmentEntries(previous).map(item=>item.id===entry.id?{...item,links:item.links.filter(value=>value!==url)}:item)))}>移除</Button>}</div>)}
              {!readonly && <div className="rd2-evidence-actions"><Input aria-label={`${category} 實績 ${index+1} 證明連結`} placeholder="本筆實績的 HTTPS 證明連結（選填）" value={linkDrafts[entry.id] || ""} onChange={event=>setLinkDrafts(previous=>({...previous,[entry.id]:event.target.value}))}/><Button type="button" variant="outline" size="sm" onClick={()=>{
                try {const url=new URL(linkDrafts[entry.id] || "");if(url.protocol!=="https:")throw new Error();onChange(previous=>withAssessmentEntries(previous,getAssessmentEntries(previous).map(item=>item.id===entry.id?{...item,links:[...new Set([...(item.links || []),url.href])]}:item)));setLinkDrafts(previous=>({...previous,[entry.id]:""}));setAttachmentError("");}catch{setAttachmentError("請輸入有效的 HTTPS 證明連結。");}
              }}>加入本筆連結</Button></div>}
              {onFeedback ? <Field><FieldLabel htmlFor={`${category}-${entry.id}-feedback`}>本筆實績回饋</FieldLabel><Textarea id={`${category}-${entry.id}-feedback`} rows={3} maxLength={10000} value={feedback?.[entry.id] || ""} placeholder="針對這筆實績留下建議或補充要求" onChange={event => onFeedback(entry.id, event.target.value)} /></Field> : feedback?.[entry.id] ? <div className="rd2-entry-feedback"><strong>本筆實績回饋</strong><p className="rd2-prewrap">{feedback[entry.id]}</p></div> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rd2-hint">
          {readonly ? "尚未填寫實績。" : "新增後，實績會依序顯示在這裡。"}
        </p>
      )}
    </div>
  );
}
