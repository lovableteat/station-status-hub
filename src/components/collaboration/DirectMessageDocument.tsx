import { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Presentation,
} from "lucide-react";
import { formatDirectMessageFileSize } from "./directMessageMedia.mjs";
import type { DirectMessageAttachment } from "@/hooks/useDirectMessages";
import { supabase } from "@/integrations/supabase/client";

export function DirectMessageDocument({
  attachment,
}: {
  attachment: DirectMessageAttachment;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);
  const Icon = /\.xlsx?$/i.test(attachment.fileName)
    ? FileSpreadsheet
    : Presentation;
  const download = async () => {
    if (downloading || !attachment.storagePath) return;
    setDownloading(true);
    setError(false);
    try {
      // Obtain a fresh member-authorized URL on every download, including after
      // the chat has been open longer than the media preview URL's lifetime.
      const { data, error: signedError } = await supabase.storage
        .from("chat-media")
        .createSignedUrl(attachment.storagePath, 60, {
          download: attachment.fileName,
        });
      if (signedError || !data?.signedUrl)
        throw signedError ?? new Error("Missing download URL");
      const url = new URL(data.signedUrl, window.location.href);
      url.searchParams.set("download", attachment.fileName);
      const link = document.createElement("a");
      link.href = url.href;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError(true);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="min-w-0 space-y-2 p-3 text-slate-100">
      <div className="flex items-center gap-2">
        <Icon className="h-6 w-6 shrink-0 text-cyan-200" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="break-all text-xs font-semibold">
            {attachment.fileName}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            {formatDirectMessageFileSize(attachment.fileSize)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading || !attachment.storagePath}
          aria-label={`下載 ${attachment.fileName}`}
          className="flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-200/20 px-2 text-xs text-cyan-100 hover:bg-cyan-200/10 disabled:opacity-50"
        >
          {downloading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {downloading ? "下載中" : attachment.storagePath ? "下載" : "上傳中"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-rose-200">
          無法下載，請重試或重新登入。
        </p>
      ) : null}
    </div>
  );
}
