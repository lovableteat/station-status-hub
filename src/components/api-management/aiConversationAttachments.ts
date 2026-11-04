import { supabase } from '@/integrations/supabase/client';
import { withReadDeadline } from '@/lib/readDeadline';
import { bytesToBase64, type PptxInlineImage } from './pptxAttachment';

export const AI_CHAT_ATTACHMENT_BUCKET = 'ai-chat-attachments';
type SavedImage = PptxInlineImage & { storagePath?: string };
export interface UploadedAttachment {
  id: string;
  inlineData: string;
  kind: 'file' | 'image';
  mimeType: string;
  name: string;
  supplementalImages?: SavedImage[];
  size: number;
  src?: string;
  storagePath?: string;
}

function ownPath(path: unknown, ownerId: string): path is string {
  return typeof path === 'string' && path.startsWith(`${ownerId}/`)
    && /^[\w-]+\/[0-9a-f-]+\/(?:content|image-\d+)$/.test(path);
}

export function parseChatAttachment(value: unknown, ownerId: string): UploadedAttachment | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as UploadedAttachment;
  if (typeof a.id !== 'string' || typeof a.name !== 'string' || a.name.length > 4096
    || !['file', 'image'].includes(a.kind) || typeof a.mimeType !== 'string' || a.mimeType.length > 200
    || !Number.isFinite(a.size) || a.size < 0 || a.size > 100 * 1024 * 1024 || !ownPath(a.storagePath, ownerId)) return null;
  const images = a.supplementalImages ?? [];
  if (!Array.isArray(images) || images.length > 12 || images.some(image => !image || !ownPath(image.storagePath, ownerId)
    || typeof image.name !== 'string' || !['image/jpeg','image/png','image/webp'].includes(image.mimeType))) return null;
  return { id:a.id, name:a.name, kind:a.kind, mimeType:a.mimeType, size:a.size, storagePath:a.storagePath, inlineData:'',
    supplementalImages:images.map(image=>({name:image.name,mimeType:image.mimeType,storagePath:image.storagePath,data:''})) };
}

export function serializeChatAttachment(a: UploadedAttachment) {
  return { id:a.id, name:a.name, kind:a.kind, mimeType:a.mimeType, size:a.size, storagePath:a.storagePath,
    supplementalImages:a.supplementalImages?.map(image=>({name:image.name,mimeType:image.mimeType,storagePath:image.storagePath})) };
}

export function chatAttachmentPaths(a: UploadedAttachment) {
  return [a.storagePath, ...(a.supplementalImages ?? []).map(image=>image.storagePath)].filter((path): path is string=>!!path);
}

export async function persistChatAttachment(a: UploadedAttachment, ownerId: string, assertCurrent: () => void): Promise<UploadedAttachment> {
  if (ownPath(a.storagePath, ownerId)) return a;
  const prefix = `${ownerId}/${crypto.randomUUID()}`;
  const uploaded: string[] = [];
  const upload = async (data: string, mimeType: string, suffix: string) => {
    assertCurrent();
    const bytes = Uint8Array.from(atob(data), char=>char.charCodeAt(0));
    const path = `${prefix}/${suffix}`;
    const {error} = await withReadDeadline(()=>supabase.storage.from(AI_CHAT_ATTACHMENT_BUCKET).upload(path, new Blob([bytes]), {contentType:mimeType,upsert:false}),120_000);
    if (error) throw error;
    uploaded.push(path); assertCurrent(); return path;
  };
  try {
    const storagePath = await upload(a.inlineData, a.mimeType, 'content');
    const supplementalImages: SavedImage[] = [];
    for (const [index,image] of (a.supplementalImages ?? []).entries()) supplementalImages.push({...image,storagePath:await upload(image.data,image.mimeType,`image-${index}`)});
    return {...a,storagePath,supplementalImages};
  } catch {
    if (uploaded.length) await withReadDeadline(()=>supabase.storage.from(AI_CHAT_ATTACHMENT_BUCKET).remove(uploaded)).catch(()=>undefined);
    throw new Error(`附件「${a.name}」保存失敗，尚未送出 API；請重試。`);
  }
}

export async function hydrateChatAttachment(a: UploadedAttachment, ownerId: string, assertCurrent: () => void): Promise<UploadedAttachment> {
  const download = async (path: string | undefined) => {
    assertCurrent();
    if (!ownPath(path, ownerId)) throw new Error('附件不屬於目前帳號，已停止查詢。');
    const {data,error} = await withReadDeadline(signal=>supabase.storage.from(AI_CHAT_ATTACHMENT_BUCKET).download(path,{}, {signal}),60_000);
    assertCurrent();
    if (error || !data) throw new Error(`無法讀取先前附件「${a.name}」，請重試；沒有忽略附件繼續回答。`);
    return bytesToBase64(new Uint8Array(await data.arrayBuffer()));
  };
  const inlineData = a.inlineData || await download(a.storagePath);
  const supplementalImages: SavedImage[] = [];
  for (const image of a.supplementalImages ?? []) supplementalImages.push({...image,data:image.data || await download(image.storagePath)});
  assertCurrent();
  return {...a,inlineData,supplementalImages,src:a.kind==='image'?`data:${a.mimeType};base64,${inlineData}`:undefined};
}
