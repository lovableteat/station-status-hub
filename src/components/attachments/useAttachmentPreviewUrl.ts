import { parseAttachmentReference, type PrivateAttachmentBucket } from '@/lib/privateAttachments';
import { usePrivateAttachmentUrl } from './usePrivateAttachmentUrl';

// Keep external/data images unchanged; private attachments refresh and clear on auth changes.
export function useAttachmentPreviewUrl(source: string) {
  const reference = parseAttachmentReference(source);
  const { url } = usePrivateAttachmentUrl(
    (reference?.bucket as PrivateAttachmentBucket | undefined) || 'issue-attachments',
    reference?.path,
  );
  return reference ? url : source;
}
