import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { parsePrivateAttachmentUrl, resolvePrivateAttachmentPath } from './privateAttachmentPaths.mjs';

export type PrivateAttachmentBucket = 'issue-attachments' | 'task-attachments';
export const ATTACHMENT_URL_SECONDS = 300;
export const ATTACHMENT_REFRESH_MS = 240_000;

export const parseAttachmentReference = (value: string) => parsePrivateAttachmentUrl(value, SUPABASE_URL);
export const attachmentPath = (bucket: PrivateAttachmentBucket, value: string) => resolvePrivateAttachmentPath(bucket, value, SUPABASE_URL);

export async function signedAttachmentUrl(bucket: PrivateAttachmentBucket, value: string, download?: string) {
  const path = attachmentPath(bucket, value);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ATTACHMENT_URL_SECONDS, download ? { download } : undefined);
  if (error || !data?.signedUrl) throw error || new Error('附件授權連結無法建立');
  return data.signedUrl;
}

export async function downloadPrivateAttachment(bucket: PrivateAttachmentBucket, value: string, fileName: string) {
  const { data, error } = await supabase.storage.from(bucket).download(attachmentPath(bucket, value));
  if (error || !data) throw error || new Error('附件下載失敗');
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Keep the blob alive until the browser has begun consuming the download.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function openPrivateAttachment(bucket: PrivateAttachmentBucket, value: string) {
  // Reserve the tab synchronously during the user's click to avoid popup blocks
  // after the authorization request. Never navigate it to an unsigned fallback.
  const opened = window.open('about:blank', '_blank');
  if (!opened) throw new Error('請允許開啟附件預覽視窗');
  opened.opener = null;
  try { opened.location.replace(await signedAttachmentUrl(bucket, value)); }
  catch (error) { opened.close(); throw error; }
}
