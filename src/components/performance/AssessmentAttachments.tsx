import { useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
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
  disabled = false,
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
  disabled?: boolean;
  onChange?: (attachments: ReviewAttachment[]) => void;
  onBusy?: (busy: boolean) => void;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState("");
  const [downloadNotice, setDownloadNotice] = useState("");
  const totalCharacters = attachments.reduce(
    (total, attachment) => total + attachment.dataUrl.length,
    0,
  );
  const download = (attachment: ReviewAttachment) => {
    setDownloadingId(attachment.id);
    setDownloadNotice("");
    requestAnimationFrame(() => {
      try {
        const match = attachment.dataUrl.match(/^data:([^;,]+);base64,(.+)$/i);
        if (!match) throw new Error("附件內容格式不正確，請主管重新附檔。");
        const binary = atob(match[2]);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1)
          bytes[index] = binary.charCodeAt(index);
        const url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = attachment.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setDownloadNotice(`「${attachment.name}」下載已開始。`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "附件下載失敗，請重試。");
      } finally {
        setDownloadingId("");
      }
    });
  };
  return (
    <div className="rd2-review-attachments">
      {!readonly && (
        <>
          <div className="rd2-attachment-toolbar">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy || attachments.length >= MAX_MANAGER_ATTACHMENTS}
              onClick={() => inputRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              {busy ? "處理附件中…" : buttonLabel}
            </Button>
            <div className="rd2-attachment-copy">
              <strong>補充檔案</strong>
              <span>最多 4 個檔案，單檔 4 MB、合計約 4.5 MB</span>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            aria-label={label}
            accept={REVIEW_ATTACHMENT_ACCEPT}
            disabled={disabled || busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              setError('');
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
                const message = cause instanceof Error ? cause.message : "附件處理失敗，請重試。";
                setError(message);
                onError?.(message);
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
              <Button
                type="button"
                variant="ghost"
                className="rd2-attachment-download"
                title={attachment.name}
                aria-label={`下載附件 ${attachment.name}`}
                disabled={downloadingId === attachment.id}
                onClick={() => download(attachment)}
              >
                <Download aria-hidden="true" />
                <span>{attachment.name}</span>
                <small>{formatFileSize(attachment.size)}</small>
                <em>{downloadingId === attachment.id ? "下載中…" : "下載"}</em>
              </Button>
              {!readonly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || busy}
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
      {downloadNotice && <p className="rd2-hint" role="status">{downloadNotice}</p>}
      {error && <p role="alert" className="rd2-error">{error}</p>}
    </div>
  );
}
