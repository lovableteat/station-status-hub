import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_MANAGER_ATTACHMENTS, MAX_MANAGER_ATTACHMENT_BYTES, MAX_MANAGER_ATTACHMENT_CHARACTERS } from "./assessmentAttachmentPolicy.mjs";
import type { ReviewAttachment } from "./assessmentTypes";
const REVIEW_ATTACHMENT_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.jpg,.jpeg,.png,.webp";

const formatFileSize = (size: number) =>
  size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toLocaleString("zh-TW", { maximumFractionDigits: 1 })} MB`;

async function prepareReviewAttachment(file: File): Promise<ReviewAttachment> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const allowed = REVIEW_ATTACHMENT_ACCEPT.split(",").map((value) =>
    value.slice(1),
  );
  if (!extension || !allowed.includes(extension))
    throw new Error("附件支援 PDF、Word、Excel、PowerPoint、文字、ZIP 與圖片檔。");
  if (file.size > MAX_MANAGER_ATTACHMENT_BYTES)
    throw new Error("單一附件不可超過 4 MB。");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("附件讀取失敗，請重新選擇檔案。"));
    reader.readAsDataURL(file);
  });
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataUrl,
  };
}

export function AssessmentAttachments({
  attachments,
  readonly,
  label = "主管退回附件",
  buttonLabel = "附加退回檔案",
  onChange,
  onBusy,
  onError,
}: {
  attachments: ReviewAttachment[];
  label?: string;
  buttonLabel?: string;
  readonly: boolean;
  onChange?: (attachments: ReviewAttachment[]) => void;
  onBusy?: (busy: boolean) => void;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const totalCharacters = attachments.reduce(
    (total, attachment) => total + attachment.dataUrl.length,
    0,
  );
  return (
    <div className="rd2-review-attachments">
      {!readonly && (
        <>
          <div className="rd2-evidence-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || attachments.length >= MAX_MANAGER_ATTACHMENTS}
              onClick={() => inputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {busy ? "處理附件中…" : buttonLabel}
            </Button>
            <span className="rd2-hint">
              最多 4 個檔案，單檔 4 MB、合計約 4.5 MB。
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            aria-label={label}
            accept={REVIEW_ATTACHMENT_ACCEPT}
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              onBusy?.(true);
              try {
                const attachment = await prepareReviewAttachment(file);
                if (
                  totalCharacters + attachment.dataUrl.length >
                  MAX_MANAGER_ATTACHMENT_CHARACTERS
                )
                  throw new Error("附件總量過大，請移除部分檔案後再加入。");
                onChange?.([...attachments, attachment]);
                onError?.("");
              } catch (cause) {
                onError?.(
                  cause instanceof Error ? cause.message : "附件處理失敗，請重試。",
                );
              } finally {
                setBusy(false);
                onBusy?.(false);
              }
            }}
          />
        </>
      )}
      {!!attachments.length && (
        <ul className="rd2-review-attachment-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <a href={attachment.dataUrl} download={attachment.name}>
                <span>{attachment.name}</span>
                <small>{formatFileSize(attachment.size)}</small>
              </a>
              {!readonly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`移除附件 ${attachment.name}`}
                  onClick={() =>
                    onChange?.(attachments.filter((item) => item.id !== attachment.id))
                  }
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

